# E2E Test Results

> Last verified: 2026-04-15

## Prerequisites

| Credential | Env var | Source            |
| ---------- | ------- | ----------------- |
| None       | N/A     | Public Hermes API |

## Results

| #   | Step                          | Command                                | Status | Notes |
| --- | ----------------------------- | -------------------------------------- | ------ | ----- |
| 1   | Search feeds by query         | `get-feeds` (query: BTC)               | PASS   |       |
| 2   | Filter by asset type (crypto) | `get-feeds` (asset-type: crypto)       | PASS   |       |
| 3   | Filter by asset type (fx)     | `get-feeds` (asset-type: fx)           | PASS   |       |
| 4   | Get prices by symbol          | `get-prices` (symbols: BTC,ETH,SOL)    | PASS   |       |
| 5   | Get prices by feed ID         | `get-prices` (ids: BTC/USD)            | PASS   |       |
| 6   | Historical prices by symbol   | `get-historical-prices` (symbols: ETH) | PASS   |       |
| 7   | Historical prices by feed ID  | `get-historical-prices` (ids: ETH/USD) | PASS   |       |

## Skipped Commands

| Command | Reason              |
| ------- | ------------------- |
| N/A     | All commands tested |

## How to run

```bash
# No credentials needed (public Hermes API)

# Run
w3 workflow test --execute test/workflows/e2e.yaml
```
