import { createCommandRouter, setJsonOutput, handleError, W3ActionError } from '@w3-io/action-core'
import * as core from '@actions/core'
import { PythClient } from './pyth.js'
import { getUpdateFee, submitOnChain } from './onchain.js'

const router = createCommandRouter({
  'get-feeds': async () => {
    const client = createClient()
    const query = core.getInput('query') || undefined
    const assetType = core.getInput('asset-type') || undefined

    const result = await client.getFeeds({ query, assetType })
    setJsonOutput('result', result)
    writeSummary('get-feeds', result)
  },

  'get-prices': async () => {
    const client = createClient()
    const { ids, resolvedSymbols } = await resolveIds(client)
    const result = await client.getLatestPrices(ids)

    if (resolvedSymbols) {
      for (const price of result.prices) {
        const match = resolvedSymbols.find((r) => r.id === price.id)
        if (match) price.symbol = match.symbol
      }
    }

    setJsonOutput('result', result)
    writeSummary('get-prices', result)
  },

  'get-update-fee': async () => {
    const network = core.getInput('network')
    const updateData = parseUpdateDataInput(core.getInput('update-data'))
    const rpcUrl = core.getInput('rpc-url') || undefined

    const result = await getUpdateFee({ network, updateData, rpcUrl })
    setJsonOutput('result', result)
    core.summary
      .addHeading('Pyth update fee', 3)
      .addRaw(
        `On **${result.chain}**, **${result.feedCount}** feed(s) cost **${result.wei}** wei.\n`,
      )
      .write()
  },

  'submit-on-chain': async () => {
    const network = core.getInput('network')
    const updateData = parseUpdateDataInput(core.getInput('update-data'))
    const rpcUrl = core.getInput('rpc-url') || undefined
    // `value` is now required — fee policy lives in the workflow.
    // Pair this step with `get-update-fee` and pass:
    //   value: ${{ to_bigint(steps.fee.outputs.wei) }}
    const value = core.getInput('value')

    const result = await submitOnChain({ network, updateData, rpcUrl, value })
    setJsonOutput('result', result)
    core.summary
      .addHeading('Pyth on-chain commit', 3)
      .addRaw(`Submitted **${result.feedCount}** price update(s) to Pyth on **${result.chain}**\n`)
      .addRaw(`Tx: \`${result.txHash}\` · value: \`${result.value}\` wei\n`)
      .write()
  },

  'get-historical-prices': async () => {
    const client = createClient()
    const { ids, resolvedSymbols } = await resolveIds(client)
    const publishTime = core.getInput('publish-time')

    if (!publishTime) {
      throw new W3ActionError(
        'MISSING_PUBLISH_TIME',
        'publish-time is required for get-historical-prices',
      )
    }

    const result = await client.getHistoricalPrices(ids, Number(publishTime))

    if (resolvedSymbols) {
      for (const price of result.prices) {
        const match = resolvedSymbols.find((r) => r.id === price.id)
        if (match) price.symbol = match.symbol
      }
    }

    setJsonOutput('result', result)
    writeSummary('get-historical-prices', result)
  },
})

function createClient() {
  return new PythClient({
    baseUrl: core.getInput('api-url') || undefined,
  })
}

/**
 * Normalize the `update-data` input into a hex-string array.
 *
 * The workflow passes either:
 *   1. A JSON array string from a prior `get-prices` step, surfaced
 *      via `toJSON(fromJSON(...).binary.data)`.
 *   2. A single hex string (rare; mostly for testing one feed).
 *
 * Either way, `getUpdateFee` and `submitOnChain` expect an array,
 * so we coerce here and reject empties uniformly.
 */
function parseUpdateDataInput(raw) {
  if (!raw) {
    throw new W3ActionError(
      'MISSING_UPDATE_DATA',
      'update-data is required (pass the binary.data array from a prior get-prices step)',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = [raw]
  }
  if (!Array.isArray(parsed)) parsed = [parsed]
  return parsed
}

/**
 * Parse a comma-separated input into a trimmed array, or empty array if blank.
 */
function parseList(input) {
  if (!input) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Resolve IDs from either the `ids` input or the `symbols` input.
 * If symbols are provided, resolves them to feed IDs via the Pyth API.
 */
async function resolveIds(client) {
  const ids = parseList(core.getInput('ids'))
  if (ids.length) return { ids, resolvedSymbols: null }

  const symbols = parseList(core.getInput('symbols'))
  if (!symbols.length) {
    throw new W3ActionError('MISSING_IDS', 'Either ids or symbols is required')
  }

  const resolved = await client.resolveSymbols(symbols)
  const missing = symbols.filter((s) => !resolved.find((r) => r.symbol === s.toUpperCase()))
  if (missing.length) {
    core.warning(`Could not resolve symbols: ${missing.join(', ')}`)
  }

  return {
    ids: resolved.map((r) => r.id),
    resolvedSymbols: resolved,
  }
}

function writeSummary(command, result) {
  if (command === 'get-feeds') {
    core.summary
      .addHeading('Pyth Price Feeds', 3)
      .addRaw(`Found **${Array.isArray(result) ? result.length : 0}** feeds\n`)
      .write()
    return
  }

  if (!result.prices?.length) return

  const rows = result.prices.map((p) => [
    p.symbol || p.id.slice(0, 12) + '...',
    p.price ? `$${p.price.value.toFixed(p.price.expo < -4 ? 6 : 2)}` : '-',
    p.price ? `\u00b1$${p.price.confidence.toFixed(p.price.expo < -4 ? 6 : 2)}` : '-',
    p.price?.publishTime ? new Date(p.price.publishTime * 1000).toISOString() : '-',
  ])

  core.summary
    .addHeading(`Pyth ${command}`, 3)
    .addTable([
      [
        { data: 'Symbol', header: true },
        { data: 'Price', header: true },
        { data: 'Confidence', header: true },
        { data: 'Published', header: true },
      ],
      ...rows,
    ])
    .write()
}

try {
  await router()
} catch (err) {
  if (err instanceof W3ActionError) {
    core.setFailed(`[${err.code}] ${err.message}`)
  } else {
    handleError(err)
  }
}
