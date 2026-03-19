import { jest } from '@jest/globals'
import { readFileSync } from 'fs'

const feedsFixture = JSON.parse(readFileSync(new URL('../__fixtures__/feeds-response.json', import.meta.url)))
const pricesFixture = JSON.parse(readFileSync(new URL('../__fixtures__/prices-response.json', import.meta.url)))

const mockFetch = jest.fn()
global.fetch = mockFetch

const mockCore = await import('../__fixtures__/core.js')
jest.unstable_mockModule('@actions/core', () => mockCore)

const { run } = await import('../src/main.js')

function mockOk(data) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  })
}

describe('run', () => {
  beforeEach(() => {
    mockCore.reset()
    mockFetch.mockReset()
  })

  test('get-feeds returns feeds array', async () => {
    mockCore.setInputs({ command: 'get-feeds' })
    mockOk(feedsFixture)

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result).toHaveLength(4)
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-feeds with query and asset-type', async () => {
    mockCore.setInputs({ command: 'get-feeds', query: 'BTC', 'asset-type': 'crypto' })
    mockOk([feedsFixture[0]])

    await run()

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('query=BTC')
    expect(url).toContain('asset_type=crypto')
  })

  test('get-prices with symbols resolves to IDs', async () => {
    mockCore.setInputs({ command: 'get-prices', symbols: 'BTC,ETH' })
    // First call: resolveSymbols fetches feeds
    mockOk(feedsFixture)
    // Second call: getLatestPrices
    mockOk(pricesFixture)

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.prices).toHaveLength(2)
    expect(result.prices[0].symbol).toBe('BTC')
    expect(result.prices[1].symbol).toBe('ETH')
    expect(result.prices[0].price.value).toBeCloseTo(87452.3, 1)
  })

  test('get-prices with IDs directly', async () => {
    mockCore.setInputs({
      command: 'get-prices',
      ids: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    })
    mockOk(pricesFixture)

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.prices).toHaveLength(2)
    // No symbol enrichment when using raw IDs
    expect(result.prices[0].symbol).toBeUndefined()
  })

  test('get-historical-prices requires publish-time', async () => {
    mockCore.setInputs({ command: 'get-historical-prices', symbols: 'BTC' })
    mockOk(feedsFixture)

    await run()

    expect(mockCore.getErrors()).toHaveLength(1)
    expect(mockCore.getErrors()[0]).toContain('publish-time')
  })

  test('get-historical-prices with publish-time', async () => {
    mockCore.setInputs({
      command: 'get-historical-prices',
      symbols: 'BTC',
      'publish-time': '1710756000',
    })
    mockOk(feedsFixture)
    mockOk(pricesFixture)

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.prices).toHaveLength(2)

    const url = mockFetch.mock.calls[1][0]
    expect(url).toContain('/v2/updates/price/1710756000')
  })

  test('unknown command fails', async () => {
    mockCore.setInputs({ command: 'bogus' })

    await run()

    expect(mockCore.getErrors()).toHaveLength(1)
    expect(mockCore.getErrors()[0]).toContain('Unknown command')
  })

  test('missing ids and symbols fails', async () => {
    mockCore.setInputs({ command: 'get-prices' })

    await run()

    expect(mockCore.getErrors()).toHaveLength(1)
    expect(mockCore.getErrors()[0]).toContain('ids or symbols')
  })
})
