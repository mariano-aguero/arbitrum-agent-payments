# Changelog

All notable changes to `@mariano-aguero/anthropic-x402-tools` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-05

### Added

- `createX402Tools`: ready-made `fetch_url` and `check_balance` tools for the Anthropic SDK tool runner. `fetch_url` pays x402 v2 challenges transparently through the official `@x402/fetch` client and reports the settlement tx hash back to the model.
- Origin-based URL allowlist (parsed origins, not string prefixes), affordability check before signing, and refusal of 402 responses whose challenge header is unreadable.
- `payments` audit trail with one record per settled payment.
- `createX402Wallet` and `formatTokenAmount` helpers, plus `createX402ToolsFromDeps` for custom transports and tests.

[0.1.0]: https://github.com/mariano-aguero/arbitrum-agent-payments/releases/tag/anthropic-x402-tools%400.1.0
