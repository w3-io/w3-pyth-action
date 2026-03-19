# W3 Pyth Action

GitHub Action for real-time and historical price data via the
[Pyth Network](https://pyth.network) Hermes API. Supports crypto,
equities, FX, metals, and more. No API key required.

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
