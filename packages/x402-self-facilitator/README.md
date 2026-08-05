# @mariano-aguero/x402-self-facilitator

[![npm](https://img.shields.io/npm/v/@mariano-aguero/x402-self-facilitator)](https://www.npmjs.com/package/@mariano-aguero/x402-self-facilitator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mariano-aguero/arbitrum-agent-payments/blob/main/LICENSE)

Self-settle [x402](https://x402.org) payments on any EVM chain, in process, with no external facilitator service.

Hosted x402 facilitators cover a handful of networks. If you want to charge for an API on Arbitrum, or any other EVM chain they skip, you are stuck. This package turns your resource server into its own facilitator: payment verification and settlement run against the chain directly, signed by a wallet you control.

Because the exact scheme uses EIP-3009 `transferWithAuthorization`, your wallet submits the settlement transaction and pays its gas. Payers stay gasless: they only need the token.

## Install

```bash
pnpm add @mariano-aguero/x402-self-facilitator viem
```

`viem` 2.x is a peer dependency. Node 20 or newer. The usage example below also needs your server adapter and the EVM scheme:

```bash
pnpm add @x402/hono @x402/evm hono
```

## Usage

The result implements the `FacilitatorClient` interface from `@x402/core`, so it plugs into any official x402 server adapter (`@x402/hono`, `@x402/express`, `@x402/next`):

```ts
import { createSelfFacilitator } from "@mariano-aguero/x402-self-facilitator";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.SELLER_PRIVATE_KEY as `0x${string}`);
const facilitator = createSelfFacilitator({ chain: arbitrumSepolia, account });

app.use(
  "/api/insight",
  paymentMiddlewareFromConfig(
    {
      "GET /api/insight": {
        accepts: {
          scheme: "exact",
          network: "eip155:421614",
          payTo: account.address,
          price: "$0.01",
        },
      },
    },
    facilitator,
    [{ network: "eip155:421614", server: new ExactEvmScheme() }],
  ),
);
```

### Options

| Option | Required | Description |
| --- | --- | --- |
| `chain` | yes | Any viem `Chain` object. The CAIP-2 network id is derived from `chain.id`. |
| `account` | yes | viem `LocalAccount` (e.g. from `privateKeyToAccount`) that signs settlement transactions and pays their gas. |
| `rpcUrl` | no | RPC override. Defaults to the chain's public RPC. |
| `eip6492AllowedFactories` | no | Factory allowlist for ERC-6492 smart wallet deployment. Off by default. |

### What the settlement wallet needs

- Native currency for gas (it submits the `transferWithAuthorization` transactions).
- Nothing else. It never custodies payer funds; tokens move straight from payer to `payTo`.

### Token support

The exact scheme settles EIP-3009 authorizations (USDC supports this on every chain Circle deploys to) and Permit2 payloads for other ERC-20s, both handled by `@x402/evm`. Pick a `payTo` token accordingly.

## When to use a hosted facilitator instead

If your network is served by a hosted facilitator you trust, that is one less wallet to fund and monitor. Use this package when your chain is not covered, when you want zero third-party dependencies, or when you need settlement to run inside your own infrastructure.

## License

[MIT](https://github.com/mariano-aguero/arbitrum-agent-payments/blob/main/LICENSE)
