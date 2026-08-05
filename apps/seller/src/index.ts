import { serve } from "@hono/node-server";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import { loadSellerEnv } from "./env.js";
import { createEmbeddedFacilitator } from "./facilitator.js";
import { createSellerApp } from "./app.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env file. Rely on the process environment (CI, docker, etc.).
}

const env = loadSellerEnv();
const network = getNetwork(env.CHAIN);
const account = privateKeyToAccount(env.SELLER_PRIVATE_KEY as `0x${string}`);

const app = createSellerApp({
  env,
  sellerAddress: account.address,
  facilitator: createEmbeddedFacilitator(network, account, env.RPC_URL),
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[seller]  listening on :${info.port} (${network.key})`);
  console.log(`[seller]  payTo ${account.address}, /api/insight costs $0.01 USDC`);
});
