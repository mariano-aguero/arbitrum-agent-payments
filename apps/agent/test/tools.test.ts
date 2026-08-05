import { describe, expect, it } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import { getNetwork } from "@arbitrum-agent-payments/chains";
import { createAgentTools, type PaymentRecord, type ToolDeps } from "../src/tools.js";
import type { AgentWallet } from "../src/wallet.js";

const API_BASE = "http://localhost:4021";

function fakeWallet(usdcAtomic: bigint): AgentWallet {
  return {
    address: "0x0000000000000000000000000000000000000001",
    network: getNetwork("arbitrum-sepolia"),
    account: {} as AgentWallet["account"],
    usdcBalance: async () => usdcAtomic,
    balances: async () => ({
      usdc: "1.25",
      eth: "0.01",
      address: "0x0000000000000000000000000000000000000001",
      network: "arbitrum-sepolia",
    }),
  };
}

const challenge402 = () =>
  new Response("{}", {
    status: 402,
    headers: {
      "payment-required": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: { url: `${API_BASE}/api/insight` },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:421614",
            asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            amount: "10000",
            payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            maxTimeoutSeconds: 300,
            extra: {},
          },
        ],
      }),
    },
  });

function buildDeps(overrides: Partial<ToolDeps>): { deps: ToolDeps; payments: PaymentRecord[] } {
  const payments: PaymentRecord[] = [];
  const deps: ToolDeps = {
    wallet: fakeWallet(1_000_000n),
    plainFetch: (async () => challenge402()) as typeof fetch,
    payingFetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    apiBase: API_BASE,
    payments,
    ...overrides,
  };
  return { deps, payments };
}

async function runFetchTool(deps: ToolDeps, url: string): Promise<Record<string, unknown>> {
  const [fetchUrl] = createAgentTools(deps);
  const raw = await (fetchUrl as { run: (input: { url: string }) => Promise<string> }).run({ url });
  return JSON.parse(raw);
}

describe("fetch_url tool", () => {
  it("rejects URLs outside the API base allowlist", async () => {
    const { deps } = buildDeps({});
    const result = await runFetchTool(deps, "https://evil.example.com/steal");
    expect(result.error).toBe("HTTP_ERROR");
  });

  it("passes free responses through without payment", async () => {
    const { deps, payments } = buildDeps({
      plainFetch: (async () =>
        new Response(JSON.stringify({ message: "hi", paid: false }), { status: 200 })) as typeof fetch,
    });
    const result = await runFetchTool(deps, `${API_BASE}/api/free`);
    expect(result.status).toBe(200);
    expect(result.payment).toBeNull();
    expect(payments).toHaveLength(0);
  });

  it("refuses to pay when the wallet can't afford the challenge (AC-5)", async () => {
    const { deps } = buildDeps({ wallet: fakeWallet(0n) });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.error).toBe("INSUFFICIENT_FUNDS");
    expect(result.detail).toMatch(/0\.01 USDC/);
  });

  it("surfaces settlement failures as tool errors (AC-E1)", async () => {
    const { deps } = buildDeps({
      payingFetch: (async () =>
        new Response("settlement failed", { status: 402 })) as typeof fetch,
    });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.error).toBe("SETTLEMENT_FAILED");
  });

  it("records the payment and reports the amount on success (AC-2)", async () => {
    const { deps, payments } = buildDeps({});
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.status).toBe(200);
    const payment = result.payment as { made: boolean; amountUsdc: string };
    expect(payment.made).toBe(true);
    expect(payment.amountUsdc).toBe("0.01");
    // No settlement header in the mock, so nothing lands in the summary list.
    expect(payments).toHaveLength(0);
  });
});
