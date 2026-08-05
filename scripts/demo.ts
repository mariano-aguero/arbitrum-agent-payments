/**
 * End-to-end demo: boots the seller, then has the Claude agent answer one free
 * question and one that requires paying $0.01 USDC on Arbitrum Sepolia.
 *
 * Run with `pnpm demo` after filling .env (see .env.example).
 */
import Anthropic from "@anthropic-ai/sdk";
import { serve, type ServerType } from "@hono/node-server";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSelfFacilitator } from "@mariano-aguero/x402-self-facilitator";
import { createX402Tools } from "@mariano-aguero/anthropic-x402-tools";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import { loadSellerEnv } from "../apps/seller/src/env.js";
import { createSellerApp, INSIGHT_PRICE } from "../apps/seller/src/app.js";
import { loadAgentEnv } from "../apps/agent/src/env.js";
import { runAgent } from "../apps/agent/src/agent.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  console.error("No .env found. Copy .env.example and fill it in.");
  process.exit(1);
}

// Step 1: config, failing fast with the offending variable named.
const sellerEnv = loadSellerEnv();
const agentEnv = loadAgentEnv();
const network = getNetwork(sellerEnv.CHAIN);

// Step 2: seller with its self-hosted facilitator.
const sellerAccount = privateKeyToAccount(sellerEnv.SELLER_PRIVATE_KEY as `0x${string}`);
const app = createSellerApp({
  env: sellerEnv,
  sellerAddress: sellerAccount.address,
  facilitator: createSelfFacilitator({
    chain: network.viemChain,
    account: sellerAccount,
    rpcUrl: sellerEnv.RPC_URL,
  }),
});

const server: ServerType = await new Promise((resolve) => {
  const s = serve({ fetch: app.fetch, port: sellerEnv.PORT }, () => resolve(s));
});
const apiBase = `http://localhost:${sellerEnv.PORT}`;
console.log(`[seller]  listening on :${sellerEnv.PORT} (${network.key})`);

const health = await fetch(`${apiBase}/api/free`);
if (!health.ok) fail(`seller health check failed with ${health.status}`);

// The seller submits settlement transactions, so it is the one that needs gas.
const chainClient = createPublicClient({
  chain: network.viemChain,
  transport: http(sellerEnv.RPC_URL),
});
const sellerEth = await chainClient.getBalance({ address: sellerAccount.address });
console.log(`[seller]  ${sellerAccount.address}: ${formatEther(sellerEth)} ETH for settlement gas`);
if (sellerEth === 0n) {
  console.error(
    "[seller]  needs Sepolia ETH to submit settlements.\n" +
      "          Faucet: https://faucet.arbitrum.io",
  );
  process.exit(1);
}

// Step 3: the agent wallet must be able to afford the demo.
const { tools, payments, wallet } = createX402Tools({
  account: privateKeyToAccount(agentEnv.AGENT_PRIVATE_KEY as `0x${string}`),
  chain: network.viemChain,
  token: network.usdc,
  apiBase,
  rpcUrl: agentEnv.RPC_URL,
});
const balances = await wallet.balances();
console.log(`[wallet]  ${balances.address}: ${balances.token} USDC, ${balances.native} ETH`);
if ((await wallet.tokenBalance()) < 10000n) {
  console.error(
    `[wallet]  needs at least ${INSIGHT_PRICE} in test USDC.\n` +
      `          Faucet: https://faucet.circle.com (select Arbitrum Sepolia)`,
  );
  process.exit(1);
}

// Step 4 and 5: the agent conversation.
const anthropic = new Anthropic({ apiKey: agentEnv.ANTHROPIC_API_KEY });

const q1 = "Is the demo API up? Use the free endpoint and tell me what it says.";
console.log(`\n[agent]   Q1 (free): ${q1}`);
const a1 = await runAgent({ client: anthropic, tools, apiBase, prompt: q1 });
console.log(`[agent]   ${a1}`);
if (payments.length > 0) fail("the free question should not have triggered a payment");

const q2 = "Buy me one premium insight about Arbitrum and quote it back to me.";
console.log(`\n[agent]   Q2 (paid): ${q2}`);
const a2 = await runAgent({ client: anthropic, tools, apiBase, prompt: q2 });
console.log(`[agent]   ${a2}`);
if (payments.length !== 1) fail(`expected exactly one payment, saw ${payments.length}`);

// Step 6: summary.
console.log(`\n[summary] ${payments.length} payment(s)`);
for (const p of payments) {
  console.log(`[summary] ${p.amount} USDC (${network.explorerTxBase}${p.txHash})`);
}
server.close();
process.exit(0);

function fail(reason: string): never {
  console.error(`\n[demo] FAILED: ${reason}`);
  server?.close();
  process.exit(1);
}
