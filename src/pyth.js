/**
 * Pyth Hermes API client.
 *
 * Wraps the Pyth Network price oracle for real-time and historical price data.
 * Supports crypto, equities, FX, metals, rates, commodities, and more.
 * Designed for reuse — import this module directly if building a custom action.
 */

const DEFAULT_BASE_URL = 'https://hermes.pyth.network'

export class PythError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message)
    this.name = 'PythError'
    this.status = status
    this.body = body
    this.code = code
  }
}

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
    if (!ids?.length) throw new PythError('At least one feed ID is required', { code: 'MISSING_IDS' })

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
    if (!ids?.length) throw new PythError('At least one feed ID is required', { code: 'MISSING_IDS' })
    if (!publishTime) throw new PythError('publish-time is required', { code: 'MISSING_PUBLISH_TIME' })

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
   */
  formatPriceUpdate(data) {
    if (!data.parsed) return { prices: [] }

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
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    const body = await response.text()

    if (!response.ok) {
      throw new PythError(`Pyth API error: ${response.status}`, {
        status: response.status,
        body,
        code: 'API_ERROR',
      })
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new PythError('Invalid JSON response from Pyth', {
        status: response.status,
        body,
        code: 'PARSE_ERROR',
      })
    }
  }
}
