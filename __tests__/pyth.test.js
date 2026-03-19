import { jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { PythClient, PythError } from '../src/pyth.js'

const feedsFixture = JSON.parse(readFileSync(new URL('../__fixtures__/feeds-response.json', import.meta.url)))
const pricesFixture = JSON.parse(readFileSync(new URL('../__fixtures__/prices-response.json', import.meta.url)))

const mockFetch = jest.fn()
global.fetch = mockFetch

function mockOk(data) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  })
}

function mockError(status, body) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  })
}

describe('PythClient', () => {
  const client = new PythClient()

  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getFeeds', () => {
    test('returns feeds array', async () => {
      mockOk(feedsFixture)
      const result = await client.getFeeds()
      expect(result).toHaveLength(4)
      expect(result[0].id).toBe('e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43')
    })

    test('passes query and asset type params', async () => {
      mockOk([])
      await client.getFeeds({ query: 'BTC', assetType: 'crypto' })

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('query=BTC')
      expect(url).toContain('asset_type=crypto')
    })

    test('omits params when not provided', async () => {
      mockOk([])
      await client.getFeeds()

      const url = mockFetch.mock.calls[0][0]
      expect(url).not.toContain('?')
    })
  })

  describe('getLatestPrices', () => {
    test('returns decoded prices', async () => {
      mockOk(pricesFixture)
      const result = await client.getLatestPrices([
        'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      ])

      expect(result.prices).toHaveLength(2)
      expect(result.prices[0].price.value).toBeCloseTo(87452.3, 1)
      expect(result.prices[0].price.confidence).toBeCloseTo(12, 0)
      expect(result.prices[0].emaPrice).toBeDefined()
      expect(result.prices[0].metadata.slot).toBe(12345678)
    })

    test('requires at least one ID', async () => {
      await expect(client.getLatestPrices([])).rejects.toThrow('At least one feed ID')
    })

    test('passes IDs as array params', async () => {
      mockOk(pricesFixture)
      await client.getLatestPrices(['aaa', 'bbb'])

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('ids%5B%5D=aaa')
      expect(url).toContain('ids%5B%5D=bbb')
    })
  })

  describe('getHistoricalPrices', () => {
    test('includes publish time in URL path', async () => {
      mockOk(pricesFixture)
      await client.getHistoricalPrices(['aaa'], 1710756000)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/v2/updates/price/1710756000')
    })

    test('requires publish time', async () => {
      await expect(client.getHistoricalPrices(['aaa'])).rejects.toThrow('publish-time is required')
    })
  })

  describe('resolveSymbols', () => {
    test('resolves BTC and ETH to USD feed IDs', async () => {
      mockOk(feedsFixture)
      const result = await client.resolveSymbols(['BTC', 'ETH'])

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        symbol: 'BTC',
        id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      })
      expect(result[1]).toEqual({
        symbol: 'ETH',
        id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      })
    })

    test('is case-insensitive', async () => {
      mockOk(feedsFixture)
      const result = await client.resolveSymbols(['btc'])
      expect(result[0].symbol).toBe('BTC')
    })

    test('skips unresolvable symbols', async () => {
      mockOk(feedsFixture)
      const result = await client.resolveSymbols(['BTC', 'DOESNOTEXIST'])
      expect(result).toHaveLength(1)
    })

    test('only matches USD quote currency', async () => {
      mockOk(feedsFixture)
      // BTC/EUR exists in fixtures but should not match
      const result = await client.resolveSymbols(['BTC'])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43')
    })
  })

  describe('error handling', () => {
    test('throws on API error', async () => {
      mockError(500, 'Internal Server Error')
      try {
        await client.getFeeds()
      } catch (e) {
        expect(e).toBeInstanceOf(PythError)
        expect(e.code).toBe('API_ERROR')
        expect(e.status).toBe(500)
      }
    })

    test('throws on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'not json',
      })
      try {
        await client.getFeeds()
      } catch (e) {
        expect(e).toBeInstanceOf(PythError)
        expect(e.code).toBe('PARSE_ERROR')
      }
    })
  })
})
