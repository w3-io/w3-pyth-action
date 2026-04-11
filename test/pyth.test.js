/**
 * PythClient unit tests.
 *
 * Mocks `fetch` globally so we can test the client without hitting
 * the real Pyth Hermes API.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { PythClient } from '../src/pyth.js'
import { W3ActionError } from '@w3-io/action-core'

const FEEDS_RESPONSE = [
  {
    id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    attributes: {
      base: 'BTC',
      quote_currency: 'USD',
      generic_symbol: 'BTCUSD',
      description: 'BITCOIN / US DOLLAR',
    },
  },
  {
    id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    attributes: {
      base: 'ETH',
      quote_currency: 'USD',
      generic_symbol: 'ETHUSD',
      description: 'ETHEREUM / US DOLLAR',
    },
  },
  {
    id: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    attributes: {
      base: 'SOL',
      quote_currency: 'USD',
      generic_symbol: 'SOLUSD',
      description: 'SOLANA / US DOLLAR',
    },
  },
  {
    id: 'aaa1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
    attributes: {
      base: 'BTC',
      quote_currency: 'EUR',
      generic_symbol: 'BTCEUR',
      description: 'BITCOIN / EURO',
    },
  },
]

const PRICES_RESPONSE = {
  binary: { encoding: 'hex', data: ['deadbeef'] },
  parsed: [
    {
      id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      price: {
        price: '8745230000000',
        conf: '1200000000',
        expo: -8,
        publish_time: 1710756000,
      },
      ema_price: {
        price: '8740000000000',
        conf: '1100000000',
        expo: -8,
        publish_time: 1710756000,
      },
      metadata: {
        prev_publish_time: 1710755999,
        proof_available_time: 1710756001,
        slot: 12345678,
      },
    },
    {
      id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      price: {
        price: '352140000000',
        conf: '50000000',
        expo: -8,
        publish_time: 1710756000,
      },
      ema_price: {
        price: '351800000000',
        conf: '48000000',
        expo: -8,
        publish_time: 1710756000,
      },
      metadata: {
        prev_publish_time: 1710755999,
        proof_available_time: 1710756001,
        slot: 12345678,
      },
    },
  ],
}

let originalFetch
let calls

beforeEach(() => {
  originalFetch = global.fetch
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
})

function mockFetch(responses) {
  let index = 0
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses[index++]
    if (!response) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`)
    }
    const status = response.status ?? 200
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      headers: new Map([['content-type', 'application/json']]),
      text: async () =>
        typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {}),
      json: async () => response.body ?? {},
    }
  }
}

describe('PythClient: getFeeds', () => {
  it('returns feeds array', async () => {
    mockFetch([{ body: FEEDS_RESPONSE }])
    const client = new PythClient()

    const result = await client.getFeeds()

    assert.equal(result.length, 4)
    assert.equal(result[0].id, 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43')
  })

  it('passes query and asset type params', async () => {
    mockFetch([{ body: [] }])
    const client = new PythClient()

    await client.getFeeds({ query: 'BTC', assetType: 'crypto' })

    assert.match(calls[0].url, /query=BTC/)
    assert.match(calls[0].url, /asset_type=crypto/)
  })

  it('omits params when not provided', async () => {
    mockFetch([{ body: [] }])
    const client = new PythClient()

    await client.getFeeds()

    assert.equal(calls[0].url.includes('?'), false)
  })
})

describe('PythClient: getLatestPrices', () => {
  it('returns decoded prices', async () => {
    mockFetch([{ body: PRICES_RESPONSE }])
    const client = new PythClient()

    const result = await client.getLatestPrices([
      'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    ])

    assert.equal(result.prices.length, 2)
    assert.ok(Math.abs(result.prices[0].price.value - 87452.3) < 0.1)
    assert.ok(Math.abs(result.prices[0].price.confidence - 12) < 1)
    assert.ok(result.prices[0].emaPrice)
    assert.equal(result.prices[0].metadata.slot, 12345678)
  })

  it('requires at least one ID', async () => {
    const client = new PythClient()
    await assert.rejects(() => client.getLatestPrices([]), /At least one feed ID/)
  })

  it('passes IDs as array params', async () => {
    mockFetch([{ body: PRICES_RESPONSE }])
    const client = new PythClient()

    await client.getLatestPrices(['aaa', 'bbb'])

    assert.match(calls[0].url, /ids%5B%5D=aaa/)
    assert.match(calls[0].url, /ids%5B%5D=bbb/)
  })
})

describe('PythClient: getHistoricalPrices', () => {
  it('includes publish time in URL path', async () => {
    mockFetch([{ body: PRICES_RESPONSE }])
    const client = new PythClient()

    await client.getHistoricalPrices(['aaa'], 1710756000)

    assert.match(calls[0].url, /\/v2\/updates\/price\/1710756000/)
  })

  it('requires publish time', async () => {
    const client = new PythClient()
    await assert.rejects(() => client.getHistoricalPrices(['aaa']), /publish-time is required/)
  })
})

describe('PythClient: resolveSymbols', () => {
  it('resolves BTC and ETH to USD feed IDs', async () => {
    mockFetch([{ body: FEEDS_RESPONSE }])
    const client = new PythClient()

    const result = await client.resolveSymbols(['BTC', 'ETH'])

    assert.equal(result.length, 2)
    assert.deepEqual(result[0], {
      symbol: 'BTC',
      id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    })
    assert.deepEqual(result[1], {
      symbol: 'ETH',
      id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    })
  })

  it('is case-insensitive', async () => {
    mockFetch([{ body: FEEDS_RESPONSE }])
    const client = new PythClient()

    const result = await client.resolveSymbols(['btc'])

    assert.equal(result[0].symbol, 'BTC')
  })

  it('skips unresolvable symbols', async () => {
    mockFetch([{ body: FEEDS_RESPONSE }])
    const client = new PythClient()

    const result = await client.resolveSymbols(['BTC', 'DOESNOTEXIST'])

    assert.equal(result.length, 1)
  })

  it('only matches USD quote currency', async () => {
    mockFetch([{ body: FEEDS_RESPONSE }])
    const client = new PythClient()

    const result = await client.resolveSymbols(['BTC'])

    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43')
  })
})

describe('PythClient: error handling', () => {
  it('throws W3ActionError on API error', async () => {
    mockFetch([{ status: 500, body: 'Internal Server Error' }])
    const client = new PythClient()

    await assert.rejects(
      () => client.getFeeds(),
      (err) => err instanceof W3ActionError && err.code === 'HTTP_ERROR' && err.statusCode === 500,
    )
  })
})
