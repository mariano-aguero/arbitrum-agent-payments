# Changelog

All notable changes to `@mariano-aguero/x402-self-facilitator` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-05

### Added

- `createSelfFacilitator`: an in-process x402 facilitator for any EVM chain, built on the official `@x402/core` and `@x402/evm` packages. Implements `FacilitatorClient` (verify, settle, getSupported), so it drops into `@x402/hono`, `@x402/express` and `@x402/next`.
- Gasless payers out of the box: settlement submits EIP-3009 `transferWithAuthorization` from the configured account, which pays the gas.
- `eip6492AllowedFactories` pass-through for ERC-6492 smart wallet deployment.

[0.1.0]: https://github.com/mariano-aguero/arbitrum-agent-payments/releases/tag/x402-self-facilitator%400.1.0
