import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import type { Chain, LocalAccount } from "viem";
import { createX402Wallet, type X402Wallet } from "./wallet.js";
import { createX402ToolsFromDeps, type PaymentRecord } from "./tools.js";

export { createX402ToolsFromDeps } from "./tools.js";
export type { PaymentRecord, X402ToolDeps } from "./tools.js";
export { createX402Wallet, formatTokenAmount } from "./wallet.js";
export type { X402Wallet, X402WalletConfig } from "./wallet.js";

export interface X402ToolsConfig {
  /** viem local account that signs payment authorizations (never pays gas). */
  account: LocalAccount;
  /** Chain to pay on (any viem chain object). */
  chain: Chain;
  /** Payment token, e.g. USDC on the target chain. Decimals default to 6. */
  token: { address: `0x${string}`; decimals?: number };
  /** Origin allowlist: only URLs on this origin are fetched or paid. */
  apiBase: string;
  /** Optional RPC override for balance reads. */
  rpcUrl?: string;
  /** Fetch implementation, injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Overrides the fetch_url tool description shown to the model. */
  fetchToolDescription?: string;
}

export interface X402Tools {
  /** Pass straight to the Anthropic tool runner's `tools` array. */
  tools: ReturnType<typeof createX402ToolsFromDeps>;
  /** Filled with one record per settled payment, in order. */
  payments: PaymentRecord[];
  wallet: X402Wallet;
}

/**
 * Payment tools for a Claude agent: a fetch tool that transparently pays
 * x402 challenges in stablecoin from the given wallet, and a balance tool.
 *
 * @example
 * import Anthropic from "@anthropic-ai/sdk";
 * import { createX402Tools } from "@mariano-aguero/anthropic-x402-tools";
 * import { privateKeyToAccount } from "viem/accounts";
 * import { arbitrumSepolia } from "viem/chains";
 *
 * const { tools, payments } = createX402Tools({
 *   account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY),
 *   chain: arbitrumSepolia,
 *   token: { address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
 *   apiBase: "http://localhost:4021",
 * });
 *
 * const client = new Anthropic();
 * const message = await client.beta.messages.toolRunner({
 *   model: "claude-opus-5",
 *   max_tokens: 16000,
 *   tools,
 *   messages: [{ role: "user", content: "Buy me one premium insight." }],
 * });
 */
export function createX402Tools(config: X402ToolsConfig): X402Tools {
  const fetchImpl = config.fetchImpl ?? fetch;
  const wallet = createX402Wallet(config.account, {
    chain: config.chain,
    token: config.token,
    rpcUrl: config.rpcUrl,
  });

  const paymentClient = new x402Client().register(
    `eip155:${config.chain.id}`,
    new ExactEvmScheme(toClientEvmSigner(config.account)),
  );

  const payments: PaymentRecord[] = [];
  const tools = createX402ToolsFromDeps({
    wallet,
    plainFetch: fetchImpl,
    payingFetch: wrapFetchWithPayment(fetchImpl, paymentClient),
    apiBase: config.apiBase,
    payments,
    fetchToolDescription: config.fetchToolDescription,
  });

  return { tools, payments, wallet };
}
