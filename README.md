# W3 Pyth Action

GitHub Action for real-time and historical price data via the
[Pyth Network](https://pyth.network) Hermes API. Supports crypto,
equities, FX, metals, and more. No API key required.

## About Pyth Network

[Pyth Network](https://pyth.network) is a decentralized oracle
network — "the price layer for global finance." It delivers price
updates with 400ms frequency across 100+ blockchains, covering
crypto, equities, FX, metals, rates, and commodities.

Data is sourced directly from first-party publishers (exchanges,
market makers, trading firms) rather than scraped from secondary
sources. No API key is required — access is permissionless.

**Why use it:** Real-time, institutional-grade price data in
workflows. Trigger actions on price movements, calculate portfolio
values, or validate trade execution prices.

## Usage

```yaml
- name: Get BTC and ETH prices
  id: prices
  uses: w3-io/w3-pyth-action@v1
  with:
    command: get-prices
    symbols: "BTC,ETH"

- name: Use prices
  run: echo '${{ steps.prices.outputs.result }}' | jq '.prices[]'
```

## Inputs

| Name           | Required | Description                              |
|----------------|----------|------------------------------------------|
| `command`      | yes      | `get-feeds`, `get-prices`, or `get-historical-prices` |
| `ids`          | no       | Comma-separated price feed IDs (hex)     |
| `symbols`      | no       | Comma-separated token symbols            |
| `query`        | no       | Search string for `get-feeds`            |
| `asset-type`   | no       | Asset type filter for `get-feeds`        |
| `publish-time` | no       | Unix timestamp for `get-historical-prices` |
| `api-url`      | no       | Override Pyth Hermes API base URL        |

## Outputs

| Name     | Description                  |
|----------|------------------------------|
| `result` | JSON result of the operation |

## Documentation

See [docs/guide.md](docs/guide.md) for the full reference, including
command details, output schemas, and workflow examples.

## License

Private
