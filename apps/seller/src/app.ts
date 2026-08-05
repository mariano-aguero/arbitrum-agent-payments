import { Hono } from "hono";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import type { FacilitatorClient, RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import type { SellerEnv } from "./env.js";

export const INSIGHT_PRICE = "$0.01";

// A tiny "premium dataset" so the demo has something worth paying for.
const insights = [
  "Arbitrum One settles more than half of all Ethereum L2 DeFi volume on high-activity days.",
  "EIP-3009 transfers let a payer authorize USDC transfers offline; the recipient's facilitator submits them and pays gas.",
  "Stylus contracts on Arbitrum run WASM, making heavy cryptography orders of magnitude cheaper than EVM equivalents.",
];

export interface SellerAppOptions {
  env: SellerEnv;
  sellerAddress: `0x${string}`;
  facilitator: FacilitatorClient;
}

/**
 * Build the seller Hono app. Extracted from the entrypoint so tests can run it
 * with an in-memory facilitator and no listening socket.
 */
export function createSellerApp({ env, sellerAddress, facilitator }: SellerAppOptions): Hono {
  const network = getNetwork(env.CHAIN);
  const app = new Hono();

  const routes: RoutesConfig = {
    "GET /api/insight": {
      accepts: {
        scheme: "exact",
        network: network.caip,
        payTo: sellerAddress,
        price: INSIGHT_PRICE,
      },
      description: "Premium Arbitrum ecosystem insight",
      mimeType: "application/json",
    },
  };

  app.use(
    "/api/insight",
    paymentMiddlewareFromConfig(
      routes,
      facilitator,
      [{ network: network.caip, server: new ExactEvmScheme() }],
      // Default paywall + startup sync: the middleware pulls supported kinds
      // from our embedded facilitator, which is an in-process call, no HTTP.
    ),
  );

  app.get("/api/free", (c) =>
    c.json({
      message: "x402 demo API is up. The good stuff lives at /api/insight.",
      paid: false,
    }),
  );

  app.get("/api/insight", (c) => {
    const insight = insights[Math.floor(Math.random() * insights.length)]!;
    return c.json({ insight, paid: true });
  });

  return app;
}
