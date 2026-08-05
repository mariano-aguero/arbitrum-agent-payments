# Contributing

Thanks for taking a look! This project aims to stay a small, readable reference; the best contributions keep it that way.

## Ground rules

- **Scope**: this is a starter kit for x402 payments on Arbitrum. New chains, new tokens, or protocol re-implementations belong in forks; bug fixes, clarity improvements, and DX polish belong here.
- **Before a big PR**, open an issue so we can agree on direction.
- **Tests**: `pnpm test` and `pnpm typecheck` must pass. New behavior needs a test.
- **Money is `bigint`**: never floats on token amounts.
- **Secrets**: nothing in `.env` ever reaches a commit.

## Getting set up

```bash
pnpm install
pnpm test
```

The test suite runs fully offline, so you don't need funded wallets to contribute.

## Commit style

Conventional Commits (`feat:`, `fix:`, `docs:` and friends), imperative mood, one logical change per commit.
