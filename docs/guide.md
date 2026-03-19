---
title: Pyth Price Oracle
category: integrations
actions: [get-feeds, get-prices, get-historical-prices]
complexity: beginner
---

# Pyth Price Oracle

[Pyth Network](https://pyth.network) is a decentralized oracle providing institutional-grade price data across 100+ blockchains. Unlike scraped oracles, Pyth sources data directly from first-party publishers — exchanges, market makers, and trading firms — with 400ms update frequency. Covers crypto, equities, FX, metals, rates, and commodities. No API key required. Use this action for price-gated workflows, portfolio valuation, trade validation, or any scenario needing reliable real-time market data.

Real-time and historical price data for crypto, equities, FX, metals,
and more via the Pyth Network Hermes API. No API key required.

## Quick start

```yaml
- name: Get BTC and ETH prices
  id: prices
  uses: w3-io/w3-pyth-action@v1
  with:
    command: get-prices
    symbols: "BTC,ETH"

- name: Use prices
  run: echo '${{ steps.prices.outputs.result }}' | jq '.prices[] | {symbol, price: .price.value}'
```

## Commands

### get-feeds

List available price feeds with optional filtering.

| Input | Required | Description |
|-------|----------|-------------|
| `query` | no | Case-insensitive substring match (e.g. `"BTC"`) |
| `asset-type` | no | Filter by type: `crypto`, `equity`, `fx`, `metal`, `rates`, `commodities`, `crypto_index` |

### get-prices

Get latest prices. Accepts feed IDs or human-readable symbols.

| Input | Required | Description |
|-------|----------|-------------|
| `ids` | no* | Comma-separated feed IDs (hex) |
| `symbols` | no* | Comma-separated symbols (e.g. `"BTC,ETH"`) |

*One of `ids` or `symbols` is required. Symbols are resolved to USD feed IDs.

**Output:**

```json
{
  "prices": [
    {
      "id": "e62df6c8...",
      "symbol": "BTC",
      "price": {
        "value": 87452.30,
        "confidence": 12.00,
        "expo": -8,
        "publishTime": 1710756000
      },
      "emaPrice": { "value": 87400.00, "..." : "..." },
      "metadata": { "slot": 12345678 }
    }
  ]
}
```

### get-historical-prices

Same as `get-prices` but at a specific point in time.

| Input | Required | Description |
|-------|----------|-------------|
| `ids` or `symbols` | yes | Same as get-prices |
| `publish-time` | yes | Unix timestamp in seconds |

## Examples

### Price-gated workflow

```yaml
- name: Get ETH price
  id: price
  uses: w3-io/w3-pyth-action@v1
  with:
    command: get-prices
    symbols: "ETH"

- name: Execute trade if below threshold
  if: fromJSON(steps.price.outputs.result).prices[0].price.value < 3000
  run: echo "ETH below $3000 — executing buy order"
```

### Discover available feeds

```yaml
- name: List equity feeds
  id: feeds
  uses: w3-io/w3-pyth-action@v1
  with:
    command: get-feeds
    asset-type: equity
```

## Beyond the API: on-chain price feeds

This action uses Pyth's Hermes API for off-chain price data — fast,
free, and ideal for workflow-level decisions. Pyth also operates as
an **on-chain pull oracle** across 100+ blockchains.

**How it works together:** The Hermes API returns signed price
attestations. The same attestation can be submitted as part of a
smart contract transaction, where the on-chain Pyth contract verifies
the publisher signature cryptographically.

| Layer | What | Trust model |
|-------|------|-------------|
| This action (off-chain) | Workflow decisions: should I trade? Is the price right? | Signed data, verified by the workflow |
| Pyth on-chain contract | Smart contract enforcement: release funds only if price is verified | Cryptographic proof on-chain |

Think of it as **client-side vs. server-side validation**: the action
is where you decide; the smart contract is where you enforce. Neither
replaces the other — they're complementary.

For on-chain integration, see [Pyth's smart contract docs](https://docs.pyth.network/price-feeds/use-real-time-data).
The feed IDs returned by this action's `get-feeds` command are the
same IDs used in on-chain contracts.
