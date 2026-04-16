# TODO

## Current state: all commands verified

Pyth Network price feed reads + on-chain updates are all exercised in
the E2E. No credential or KYB blocks — Pyth's public feeds are open.

## Potential additions

- [ ] Lazer (low-latency) API — Pyth Lazer is their sub-second feed
      surface. Separate endpoint, separate auth pattern. If a
      workflow needs tighter freshness than Pyth's standard 400ms
      update cadence, Lazer is the path. Not yet wrapped.
- [ ] Benchmark / historical price reads — Pyth exposes past
      prices via their Hermes API. Useful for backtesting and
      audit-trail workflows.
- [ ] Entropy / VRF — Pyth Entropy is their on-chain randomness
      product (similar to Chainlink VRF). Separate contract
      surface. Worth wrapping if customer demand surfaces.
- [ ] Cross-chain price message construction — `update-price-feeds`
      currently writes to a single chain. Batch variants that push
      the same price update to multiple chains in one workflow
      step would simplify multi-chain apps.

## Docs

- [ ] `docs/guide.md` covers the reader / updater pattern but
      doesn't have a worked example of "wait for a specific price
      level" as a workflow trigger. That's a common pattern (e.g.
      "execute trade when ETH > $5000") and deserves a recipe.
