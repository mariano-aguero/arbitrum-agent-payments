# arbitrum-agent-payments

[![CI](https://github.com/mariano-aguero/arbitrum-agent-payments/actions/workflows/ci.yml/badge.svg)](https://github.com/mariano-aguero/arbitrum-agent-payments/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![x402](https://img.shields.io/badge/x402-v2-blue)](https://x402.org)
[![Arbitrum](https://img.shields.io/badge/Arbitrum-Sepolia-28a0f0)](https://sepolia.arbiscan.io)

Watch an AI agent pay for API access with real USDC on Arbitrum, end to end, in one command.

This starter kit wires together the three pieces of agentic payments so you don't have to figure them out separately:

- **A seller**: a [Hono](https://hono.dev) API whose premium endpoint charges $0.01 USDC per request via the [x402 protocol](https://x402.org) (`@x402/hono`).
- **A buyer**: a [Claude](https://platform.claude.com)-powered agent whose `fetch` tool pays 402 challenges automatically (`@x402/fetch` plus the Anthropic tool runner). The agent doesn't know about payments: it just fetches, and the wallet underneath handles the whole challenge, signature and settlement dance.
- **An embedded facilitator**: settlement runs in-process against Arbitrum Sepolia, signed by the seller's wallet. No third-party facilitator dependency, and because payments use EIP-3009 `transferWithAuthorization`, **the buying agent never needs ETH for gas**.

```
[agent] Q2 (paid): Buy me one premium insight about Arbitrum and quote it back to me.
[agent] I paid $0.01 USDC for this insight: "Stylus contracts on Arbitrum run WASM,
        making heavy cryptography orders of magnitude cheaper than EVM equivalents."
        Transaction: 0x1a2b...
[summary] 1 payment, 0.01 USDC (https://sepolia.arbiscan.io/tx/0x1a2b...)
```

## Features

- One-command demo: seller boots, agent asks a free question, then buys premium data
- Official x402 v2 packages only, no protocol code to maintain
- Gasless buyer: EIP-3009 means the agent wallet holds USDC, nothing else
- Embedded facilitator: verify + settle on Arbitrum Sepolia without external services
- Typed end to end: strict TypeScript, Zod-validated config, `bigint` money
- Mainnet-ready config: flip `CHAIN=arbitrum` when you outgrow the testnet

## Installation

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/mariano-aguero/arbitrum-agent-payments.git
cd arbitrum-agent-payments
pnpm install
cp .env.example .env
```

## Quickstart (~10 minutes)

1. **Create two throwaway wallets** (seller and agent). Any tool works; with [cast](https://getfoundry.sh):

   ```bash
   cast wallet new   # run twice, one key per role
   ```

2. **Fund them on Arbitrum Sepolia:**
   - Seller needs a little ETH for settlement gas: [Arbitrum faucet](https://faucet.arbitrum.io) or [Alchemy faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)
   - Agent needs test USDC: [Circle faucet](https://faucet.circle.com) (select **Arbitrum Sepolia**)

3. **Fill `.env`** with both private keys and your [Anthropic API key](https://platform.claude.com).

4. **Run it:**

   ```bash
   pnpm demo
   ```

   The console narrates the whole flow: the 402 challenge, the USDC payment, the settlement transaction on Arbiscan, and the agent's answer built from the paid data.

## Usage

Run the pieces separately once the demo works:

```bash
pnpm seller                       # start the paid API on :4021
pnpm agent "What does the premium endpoint say about Stylus?"
```

Point the agent at any x402-enabled API by changing `API_BASE_URL` in `.env`.

### Project layout

```
apps/seller     Hono API + x402 middleware + embedded facilitator
apps/agent      Claude tool-runner agent with a paying fetch tool
packages/chains Network config: chain ids, USDC addresses, explorers
scripts/demo.ts The scripted end-to-end run
```

### Adapting it

- **Price your own endpoints**: edit the routes config in `apps/seller/src/app.ts`; prices are plain dollar strings (`"$0.01"`), the scheme resolves them to USDC atomic units.
- **Give your own agent payment powers**: copy `apps/agent/src/tools.ts`; the whole trick is wrapping `fetch` with `wrapFetchWithPayment` and handing it to a tool.
- **Go to mainnet**: set `CHAIN=arbitrum` and fund the wallets with real USDC/ETH. Same code path.

## Testing

```bash
pnpm test        # unit + integration (in-memory, no chain access)
pnpm typecheck
```

The integration tests run the real x402 client against the real middleware with an in-memory facilitator; offline signing means no RPC needed.

## Contributing

Issues and PRs welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
