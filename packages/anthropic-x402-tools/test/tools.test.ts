import { describe, expect, it } from "vitest";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { arbitrumSepolia } from "viem/chains";
import { createX402ToolsFromDeps, type PaymentRecord, type X402ToolDeps } from "../src/tools.js";
import { formatTokenAmount, type X402Wallet } from "../src/wallet.js";

const API_BASE = "http://localhost:4021";

function fakeWallet(atomicBalance: bigint): X402Wallet {
  return {
    address: "0x0000000000000000000000000000000000000001",
    account: {} as X402Wallet["account"],
    chain: arbitrumSepolia,
    tokenDecimals: 6,
    tokenBalance: async () => atomicBalance,
    balances: async () => ({
      token: "1.25",
      native: "0.01",
      address: "0x0000000000000000000000000000000000000001",
      chainId: 421614,
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

function buildDeps(overrides: Partial<X402ToolDeps>): { deps: X402ToolDeps; payments: PaymentRecord[] } {
  const payments: PaymentRecord[] = [];
  const deps: X402ToolDeps = {
    wallet: fakeWallet(1_000_000n),
    plainFetch: (async () => challenge402()) as typeof fetch,
    payingFetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    apiBase: API_BASE,
    payments,
    ...overrides,
  };
  return { deps, payments };
}

async function runFetchTool(deps: X402ToolDeps, url: string): Promise<Record<string, unknown>> {
  const [fetchUrl] = createX402ToolsFromDeps(deps);
  const raw = await (fetchUrl as { run: (input: { url: string }) => Promise<string> }).run({ url });
  return JSON.parse(raw);
}

describe("fetch_url tool", () => {
  it("rejects URLs outside the API base allowlist", async () => {
    const { deps } = buildDeps({});
    const result = await runFetchTool(deps, "https://evil.example.com/steal");
    expect(result.error).toBe("HTTP_ERROR");
  });

  it("rejects same-prefix bypasses: port collisions and userinfo tricks", async () => {
    const { deps } = buildDeps({});
    // Same string prefix as http://localhost:4021 but a different origin.
    for (const url of [
      "http://localhost:40210/exfiltrate",
      "http://localhost:4021@evil.com/steal",
      "not a url at all",
    ]) {
      const result = await runFetchTool(deps, url);
      expect(result.error, url).toBe("HTTP_ERROR");
    }
  });

  it("refuses to pay a 402 whose challenge is unreadable", async () => {
    const { deps } = buildDeps({
      plainFetch: (async () => new Response("{}", { status: 402 })) as typeof fetch,
    });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.error).toBe("HTTP_ERROR");
    expect(result.detail).toMatch(/refusing to pay blind/);
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

  it("refuses to pay when the wallet can't afford the challenge", async () => {
    const { deps } = buildDeps({ wallet: fakeWallet(0n) });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.error).toBe("INSUFFICIENT_FUNDS");
    expect(result.detail).toMatch(/0\.01/);
  });

  it("surfaces settlement failures as tool errors", async () => {
    const { deps } = buildDeps({
      payingFetch: (async () =>
        new Response("settlement failed", { status: 402 })) as typeof fetch,
    });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.error).toBe("SETTLEMENT_FAILED");
  });

  it("records the payment with its tx hash on success", async () => {
    const txHash = "0x" + "cd".repeat(32);
    const { deps, payments } = buildDeps({
      payingFetch: (async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "payment-response": encodePaymentResponseHeader({
              success: true,
              transaction: txHash,
              network: "eip155:421614",
              payer: "0x0000000000000000000000000000000000000001",
            }),
          },
        })) as typeof fetch,
    });
    const result = await runFetchTool(deps, `${API_BASE}/api/insight`);
    expect(result.status).toBe(200);
    const payment = result.payment as { made: boolean; amount: string; txHash: string };
    expect(payment.made).toBe(true);
    expect(payment.amount).toBe("0.01");
    expect(payment.txHash).toBe(txHash);
    expect(payments).toEqual([{ url: `${API_BASE}/api/insight`, amount: "0.01", txHash }]);
  });
});

describe("check_balance tool", () => {
  it("returns the wallet snapshot as JSON", async () => {
    const { deps } = buildDeps({});
    const [, checkBalance] = createX402ToolsFromDeps(deps);
    const raw = await (checkBalance as { run: (input: object) => Promise<string> }).run({});
    expect(JSON.parse(raw)).toEqual({
      token: "1.25",
      native: "0.01",
      address: "0x0000000000000000000000000000000000000001",
      chainId: 421614,
    });
  });
});

describe("formatTokenAmount", () => {
  it("formats atomic amounts at the given decimals", () => {
    expect(formatTokenAmount(10000n, 6)).toBe("0.01");
    expect(formatTokenAmount(1250000n, 6)).toBe("1.25");
    expect(formatTokenAmount(0n, 6)).toBe("0");
    expect(formatTokenAmount(-10000n, 6)).toBe("-0.01");
    expect(formatTokenAmount(1n, 18)).toBe("0.000000000000000001");
  });
});
