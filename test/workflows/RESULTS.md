# E2E Test Results

Last verified: 2026-04-15

## Environment

- W3 local network (3-node localnet)
- Protocol: master (includes EIP-712, bridge-allow expansion, nonce manager)
- Runner image: w3io/w3-runner (Node 20/24)

## Prerequisites

- W3 local network running (make dev)
- No env vars needed (public Hermes API)

## Results

| Step | Command | Status | Notes |
|------|---------|--------|-------|
| 1 | get-feeds (query: BTC) | PASS | Search by query string |
| 2 | get-feeds (asset-type: crypto) | PASS | Filter by asset type |
| 3 | get-feeds (asset-type: fx) | PASS | Filter by FX asset type |
| 4 | get-prices (symbols: BTC,ETH,SOL) | PASS | Lookup by symbol |
| 5 | get-prices (ids: BTC/USD feed ID) | PASS | Lookup by feed ID |
| 6 | get-historical-prices (symbols: ETH) | PASS | Historical by symbol + timestamp |
| 7 | get-historical-prices (ids: ETH/USD feed ID) | PASS | Historical by feed ID + timestamp |

## Known Limitations

- None. All commands use the public Hermes API with no authentication required.
