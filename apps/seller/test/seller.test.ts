import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import { createSellerApp } from "../src/app.js";
import { loadSellerEnv } from "../src/env.js";

// Throwaway key, never funded. It only signs test payloads.
const BUYER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SELLER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const baseEnv = {
  SELLER_PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  CHAIN: "arbitrum-sepolia",
  PORT: "4021",
};

/** Facilitator stub: approves verification and settles with a fake tx hash. */
function stubFacilitator(overrides: Partial<FacilitatorClient> = {}): FacilitatorClient {
  return {
    verify: async (_payload, _req) => ({ isValid: true, payer: "0xtest" }),
    settle: async (_payload, req) => ({
      success: true,
      transaction: "0x" + "ab".repeat(32),
      network: req.network,
      payer: "0xtest",
    }),
    getSupported: async () => ({
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:421614" }],
      extensions: [],
      signers: {},
    }),
    ...overrides,
  };
}

function buildApp(facilitator: FacilitatorClient) {
  return createSellerApp({
    env: loadSellerEnv(baseEnv as NodeJS.ProcessEnv),
    sellerAddress: SELLER_ADDRESS,
    facilitator,
  });
}

/** x402-paying fetch wired to the in-memory Hono app instead of a socket. */
function payingFetchFor(app: ReturnType<typeof buildApp>) {
  const account = privateKeyToAccount(BUYER_KEY);
  const client = new x402Client().register(
    "eip155:421614",
    new ExactEvmScheme(toClientEvmSigner(account)),
  );
  const appFetch: typeof fetch = (input, init) =>
    Promise.resolve(app.request(input as never, init as never));
  return wrapFetchWithPayment(appFetch, client);
}

const json = async (res: Response) => (await res.json()) as Record<string, any>;

describe("seller API", () => {
  it("serves /api/free without payment (AC-1)", async () => {
    const res = await buildApp(stubFacilitator()).request("/api/free");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.paid).toBe(false);
  });

  it("challenges /api/insight with a 402 carrying USDC-on-Arbitrum-Sepolia requirements (AC-1)", async () => {
    const res = await buildApp(stubFacilitator()).request("http://seller.test/api/insight");
    expect(res.status).toBe(402);
    // x402 v2 carries the challenge in the payment-required header, not the body.
    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();
    const challenge = decodePaymentRequiredHeader(header!) as Record<string, any>;
    const accepts = challenge.accepts?.[0];
    expect(accepts).toBeDefined();
    expect(accepts.scheme).toBe("exact");
    expect(accepts.network).toBe("eip155:421614");
    expect(accepts.asset.toLowerCase()).toBe(
      "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d".toLowerCase(),
    );
    expect(accepts.amount).toBe("10000"); // $0.01 at 6 decimals
    expect(accepts.payTo).toBe(SELLER_ADDRESS);
  });

  it("serves the paid payload once the x402 client pays (AC-2 rail)", async () => {
    const app = buildApp(stubFacilitator());
    const res = await payingFetchFor(app)("http://seller.test/api/insight");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.paid).toBe(true);
    expect(typeof body.insight).toBe("string");
    // Settlement reference travels in the x402 response header.
    expect(res.headers.get("payment-response") ?? res.headers.get("x-payment-response")).toBeTruthy();
  });

  it("does not serve paid content when settlement fails (AC-E1)", async () => {
    const app = buildApp(
      stubFacilitator({
        settle: async (_payload, req) => ({
          success: false,
          errorReason: "insufficient_funds",
          errorMessage: "authorization exceeds balance",
          transaction: "",
          network: req.network,
        }),
      }),
    );
    const res = await payingFetchFor(app)("http://seller.test/api/insight");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("fails fast on malformed env naming the variable (AC-E2)", () => {
    expect(() =>
      loadSellerEnv({ ...baseEnv, SELLER_PRIVATE_KEY: "not-a-key" } as NodeJS.ProcessEnv),
    ).toThrow(/SELLER_PRIVATE_KEY/);
  });
});
