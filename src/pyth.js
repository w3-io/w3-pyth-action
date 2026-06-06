/**
 * Pyth Hermes API client.
 *
 * Wraps the Pyth Network price oracle for real-time and historical price data.
 * Supports crypto, equities, FX, metals, rates, commodities, and more.
 * Designed for reuse — import this module directly if building a custom action.
 */

import { request, W3ActionError } from '@w3-io/action-core'

const DEFAULT_BASE_URL = 'https://hermes.pyth.network'

export class PythClient {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /**
   * List available price feeds with optional filtering.
   *
   * @param {object} [options]
   * @param {string} [options.query] - Case-insensitive symbol substring match
   * @param {string} [options.assetType] - Asset type filter (crypto, equity, fx, metal, rates, etc.)
   * @returns {Array<{id: string, attributes: object}>}
   */
  async getFeeds({ query, assetType } = {}) {
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (assetType) params.set('asset_type', assetType)

    const qs = params.toString()
    const url = `${this.baseUrl}/v2/price_feeds${qs ? `?${qs}` : ''}`
    return this.request(url)
  }

  /**
   * Get latest prices for given feed IDs.
   *
   * @param {string[]} ids - Price feed IDs (hex strings)
   * @param {object} [options]
   * @param {boolean} [options.parsed=true] - Include parsed price data
   * @returns {object} Price update with binary and parsed fields
   */
  async getLatestPrices(ids, { parsed = true } = {}) {
    if (!ids?.length) throw new W3ActionError('MISSING_IDS', 'At least one feed ID is required')

    const params = new URLSearchParams()
    for (const id of ids) params.append('ids[]', id)
    params.set('parsed', String(parsed))

    const url = `${this.baseUrl}/v2/updates/price/latest?${params}`
    const data = await this.request(url)
    return this.formatPriceUpdate(data)
  }

  /**
   * Get prices at a specific historical publish time.
   *
   * @param {string[]} ids - Price feed IDs (hex strings)
   * @param {number} publishTime - Unix timestamp in seconds
   * @returns {object} Price update at the given timestamp
   */
  async getHistoricalPrices(ids, publishTime) {
    if (!ids?.length) throw new W3ActionError('MISSING_IDS', 'At least one feed ID is required')
    if (!publishTime) throw new W3ActionError('MISSING_PUBLISH_TIME', 'publish-time is required')

    const params = new URLSearchParams()
    for (const id of ids) params.append('ids[]', id)
    params.set('parsed', 'true')

    const url = `${this.baseUrl}/v2/updates/price/${publishTime}?${params}`
    const data = await this.request(url)
    return this.formatPriceUpdate(data)
  }

  /**
   * Resolve human-readable symbols to Pyth feed IDs.
   *
   * Fetches all crypto feeds and matches by base_symbol attribute.
   * Case-insensitive. Returns the first match per symbol.
   *
   * @param {string[]} symbols - Token symbols (e.g. ["BTC", "ETH"])
   * @returns {Array<{symbol: string, id: string}>} Resolved pairs
   */
  async resolveSymbols(symbols) {
    const feeds = await this.getFeeds({ assetType: 'crypto' })
    const results = []

    for (const symbol of symbols) {
      const upper = symbol.toUpperCase()
      const match = feeds.find((f) => {
        const base = (f.attributes?.base || f.attributes?.generic_symbol || '').toUpperCase()
        const quote = (f.attributes?.quote_currency || '').toUpperCase()
        return base === upper && quote === 'USD'
      })
      if (match) {
        results.push({ symbol: upper, id: match.id })
      }
    }

    return results
  }

  /**
   * Format raw price update response into a cleaner structure.
   *
   * Returns three views of the Hermes response:
   * - `prices[]` — human-readable decoded prices for off-chain decisions
   * - `binary` — Hermes' raw blob (preserved for downstream tools that
   *   want the original encoding metadata)
   * - `priceUpdate` — a normalized `0x`-prefixed hex array ready to
   *   pass as `bytes[]` to a Pyth contract method (e.g. the contract's
   *   own `updatePriceFeeds`, or a gated swap contract that wraps it).
   *   Always emitted in this canonical shape regardless of whether
   *   Hermes returned `encoding: "hex"` or `encoding: "base64"`, so
   *   a workflow author can splice it straight into a contract call
   *   without an intermediate node step.
   */
  formatPriceUpdate(data) {
    const binary = data.binary ?? null
    const priceUpdate = binary ? normalizeBinaryToHex(binary) : []
    if (!data.parsed) return { prices: [], binary, priceUpdate }

    return {
      prices: data.parsed.map((entry) => ({
        id: entry.id,
        price: this.decodePrice(entry.price),
        emaPrice: this.decodePrice(entry.ema_price),
        metadata: {
          prevPublishTime: entry.metadata?.prev_publish_time ?? null,
          proofAvailableTime: entry.metadata?.proof_available_time ?? null,
          slot: entry.metadata?.slot ?? null,
        },
      })),
      binary,
      priceUpdate,
    }
  }

  /**
   * Decode a Pyth price object into a human-readable number.
   */
  decodePrice(rpcPrice) {
    if (!rpcPrice) return null
    const price = Number(rpcPrice.price)
    const expo = Number(rpcPrice.expo)
    const conf = Number(rpcPrice.conf)
    return {
      value: price * Math.pow(10, expo),
      confidence: conf * Math.pow(10, expo),
      expo,
      publishTime: rpcPrice.publish_time,
      raw: rpcPrice.price,
    }
  }

  async request(url) {
    try {
      return await request(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      if (err && typeof err === 'object' && 'statusCode' in err) {
        throw new W3ActionError('HTTP_ERROR', err.message, {
          statusCode: err.statusCode,
        })
      }
      throw err
    }
  }
}

/**
 * Convert Hermes' `binary` blob into the `0x`-prefixed hex array shape
 * EVM `bytes[]` parsers accept.
 *
 * Hermes returns one of two encodings per the API's `encoding` query
 * param: `hex` (default — strings without `0x`) or `base64`. Workflows
 * shouldn't have to know which: this helper canonicalises both into
 * the contract-call-ready form so the workflow can pass `priceUpdate`
 * straight through `${{ ... }}` without an intermediate node step.
 *
 * The original `binary` object is preserved on the action output for
 * any consumer that needs the source encoding.
 */
function normalizeBinaryToHex(binary) {
  if (!binary || !Array.isArray(binary.data)) return []
  const encoding = binary.encoding ?? 'hex'
  return binary.data.map((entry) => {
    if (typeof entry !== 'string') return entry
    if (encoding === 'base64') {
      return '0x' + Buffer.from(entry, 'base64').toString('hex')
    }
    return entry.startsWith('0x') ? entry : '0x' + entry
  })
}
