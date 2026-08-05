import Anthropic from "@anthropic-ai/sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import { loadAgentEnv } from "./env.js";
import { createAgentWallet } from "./wallet.js";
import { createAgentTools, type PaymentRecord } from "./tools.js";
import { runAgent } from "./agent.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env file. Rely on the process environment.
}

const env = loadAgentEnv();
const network = getNetwork(env.CHAIN);
const wallet = createAgentWallet(env.AGENT_PRIVATE_KEY as `0x${string}`, network, env.RPC_URL);

const x402 = new x402Client().register(
  network.caip,
  new ExactEvmScheme(toClientEvmSigner(wallet.account)),
);

const payments: PaymentRecord[] = [];
const tools = createAgentTools({
  wallet,
  plainFetch: fetch,
  payingFetch: wrapFetchWithPayment(fetch, x402),
  apiBase: env.API_BASE_URL,
  payments,
});

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: pnpm agent "your question here"');
  process.exit(1);
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const answer = await runAgent({ client, tools, apiBase: env.API_BASE_URL, prompt });

console.log(`\n[agent] ${answer}`);
for (const p of payments) {
  console.log(`[paid]  ${p.amountUsdc} USDC (${network.explorerTxBase}${p.txHash})`);
}
