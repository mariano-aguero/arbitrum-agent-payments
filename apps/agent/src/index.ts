import Anthropic from "@anthropic-ai/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createX402Tools } from "@mariano-aguero/anthropic-x402-tools";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import { loadAgentEnv } from "./env.js";
import { runAgent } from "./agent.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env file. Rely on the process environment.
}

const env = loadAgentEnv();
const network = getNetwork(env.CHAIN);

const { tools, payments } = createX402Tools({
  account: privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`),
  chain: network.viemChain,
  token: network.usdc,
  apiBase: env.API_BASE_URL,
  rpcUrl: env.RPC_URL,
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
  console.log(`[paid]  ${p.amount} USDC (${network.explorerTxBase}${p.txHash})`);
}
