# @mariano-aguero/anthropic-x402-tools

[![npm](https://img.shields.io/npm/v/@mariano-aguero/anthropic-x402-tools)](https://www.npmjs.com/package/@mariano-aguero/anthropic-x402-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mariano-aguero/arbitrum-agent-payments/blob/main/LICENSE)

Give a [Claude](https://platform.claude.com) agent the ability to pay for [x402](https://x402.org) APIs with stablecoin.

Two ready-made tools for the Anthropic SDK's tool runner:

- **`fetch_url`**: fetches from an allowlisted API. When the server answers with a 402 payment challenge, the tool checks the wallet can afford it, pays via the official x402 client, and returns the data plus the settlement tx hash. The model never touches keys or signatures.
- **`check_balance`**: reads the wallet's token and native balances so the agent can reason about affordability.

Safety rails built in: the allowlist compares parsed origins (immune to prefix and userinfo tricks), unreadable challenges are refused rather than treated as free, and every settled payment is recorded so your app can print an audit trail.

## Install

```bash
pnpm add @mariano-aguero/anthropic-x402-tools @anthropic-ai/sdk viem zod
```

`@anthropic-ai/sdk`, `viem` and `zod` are peer dependencies. Node 20 or newer.

## Usage

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createX402Tools } from "@mariano-aguero/anthropic-x402-tools";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const { tools, payments } = createX402Tools({
  account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  chain: arbitrumSepolia,
  token: { address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" }, // USDC
  apiBase: "https://api.example.com",
});

const client = new Anthropic();
const message = await client.beta.messages.toolRunner({
  model: "claude-opus-5",
  max_tokens: 16000,
  tools,
  messages: [{ role: "user", content: "Buy me one premium insight and quote it." }],
});

for (const p of payments) {
  console.log(`paid ${p.amount} (tx ${p.txHash})`);
}
```

The agent wallet only needs the payment token. With the EIP-3009 exact scheme the receiving side submits the settlement transaction, so the agent never spends gas.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `account` | yes | viem `Account` that signs payment authorizations. |
| `chain` | yes | Any viem `Chain`; the CAIP-2 network id derives from `chain.id`. |
| `token` | yes | Payment token address; `decimals` defaults to 6. |
| `apiBase` | yes | Origin allowlist. The tools refuse any URL on a different origin. |
| `rpcUrl` | no | RPC override for balance reads. |
| `fetchImpl` | no | Fetch implementation, injectable for tests. |
| `fetchToolDescription` | no | Custom tool description if your API needs different guidance. |

### Lower-level access

`createX402ToolsFromDeps` accepts explicit `plainFetch` / `payingFetch` / `wallet` implementations. It is what the package's own tests use, and the hook for custom transports or mocking.

## See it working

The [arbitrum-agent-payments](https://github.com/mariano-aguero/arbitrum-agent-payments) starter kit runs these tools end to end against an x402 seller on Arbitrum Sepolia, one command, real testnet settlement.

## License

[MIT](https://github.com/mariano-aguero/arbitrum-agent-payments/blob/main/LICENSE)
