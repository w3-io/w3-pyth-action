import { PythClient } from '../src/pyth.js'

const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1'
const describeIf = (condition) => (condition ? describe : describe.skip)

describeIf(!SKIP_LIVE)('Pyth integration (live API)', () => {
  const client = new PythClient()

  test('getFeeds returns crypto feeds', async () => {
    const feeds = await client.getFeeds({ assetType: 'crypto' })
    expect(feeds.length).toBeGreaterThan(0)
    expect(feeds[0].id).toBeTruthy()
    expect(feeds[0].attributes).toBeDefined()
  })

  test('getFeeds with query filter', async () => {
    const feeds = await client.getFeeds({ query: 'BTC', assetType: 'crypto' })
    expect(feeds.length).toBeGreaterThan(0)
    const descriptions = feeds.map((f) => f.attributes?.description || '')
    expect(descriptions.some((d) => d.includes('BITCOIN'))).toBe(true)
  })

  test('resolveSymbols finds BTC and ETH', async () => {
    const resolved = await client.resolveSymbols(['BTC', 'ETH'])
    expect(resolved).toHaveLength(2)
    expect(resolved[0].symbol).toBe('BTC')
    expect(resolved[0].id).toBeTruthy()
    expect(resolved[1].symbol).toBe('ETH')
  })

  test('getLatestPrices returns real prices', async () => {
    const resolved = await client.resolveSymbols(['BTC', 'ETH'])
    const ids = resolved.map((r) => r.id)
    const result = await client.getLatestPrices(ids)

    expect(result.prices).toHaveLength(2)
    // BTC should be worth more than $1000
    expect(result.prices[0].price.value).toBeGreaterThan(1000)
    // ETH should be worth more than $100
    expect(result.prices[1].price.value).toBeGreaterThan(100)
    // Both should have publish times
    expect(result.prices[0].price.publishTime).toBeGreaterThan(0)
  })

  test('getFeeds supports equity asset type', async () => {
    const feeds = await client.getFeeds({ assetType: 'equity' })
    expect(feeds.length).toBeGreaterThan(0)
  })

  test('getFeeds supports fx asset type', async () => {
    const feeds = await client.getFeeds({ assetType: 'fx' })
    expect(feeds.length).toBeGreaterThan(0)
  })
})
