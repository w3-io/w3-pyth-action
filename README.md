# W3 Pyth Action

Price oracle for crypto, equities, FX, metals, and more via Pyth Network.

## Quick Start

```yaml
- name: Get BTC and ETH prices
  id: prices
  uses: w3-io/w3-pyth-action@v1
  with:
    command: get-prices
    symbols: 'BTC,ETH'
```

## Commands

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `get-feeds`             | Search and list available price feeds     |
| `get-prices`            | Get real-time prices by symbol or feed ID |
| `get-historical-prices` | Get prices at a specific point in time    |

## Inputs

| Input          | Required | Default                       | Description                                                                                  |
| -------------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `command`      | Yes      | —                             | `get-feeds`, `get-prices`, or `get-historical-prices`                                        |
| `ids`          | No       | —                             | Comma-separated price feed IDs (hex)                                                         |
| `symbols`      | No       | —                             | Comma-separated token symbols (e.g. `BTC,ETH`)                                               |
| `query`        | No       | —                             | Search string for `get-feeds`                                                                |
| `asset-type`   | No       | —                             | Asset type filter: `crypto`, `equity`, `fx`, `metal`, `rates`, `commodities`, `crypto_index` |
| `publish-time` | No       | —                             | Unix timestamp for `get-historical-prices`                                                   |
| `api-url`      | No       | `https://hermes.pyth.network` | Pyth Hermes API base URL override                                                            |

## Outputs

| Output   | Description                  |
| -------- | ---------------------------- |
| `result` | JSON result of the operation |

## Authentication

No API key required. Pyth Network access is permissionless.
