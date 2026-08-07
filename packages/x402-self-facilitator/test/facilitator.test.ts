import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import type { SchemeNetworkFacilitator } from "@x402/core/types";
import { createSelfFacilitator } from "../src/index.js";

// Throwaway key, never funded. Nothing here touches the chain.
const ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

describe("createSelfFacilitator", () => {
  it("reports the exact scheme on the chain's CAIP-2 network", async () => {
    const facilitator = createSelfFacilitator({ chain: arbitrumSepolia, account: ACCOUNT });
    const supported = await facilitator.getSupported();
    expect(supported.kinds).toContainEqual(
      expect.objectContaining({ scheme: "exact", network: "eip155:421614" }),
    );
  });

  it("exposes the settlement signer address", async () => {
    const facilitator = createSelfFacilitator({ chain: arbitrumSepolia, account: ACCOUNT });
    const supported = await facilitator.getSupported();
    const signers = Object.values(supported.signers).flat();
    expect(signers).toContain(ACCOUNT.address);
  });

  it("serves an extra scheme alongside exact", async () => {
    // A payer that is a contract cannot produce the EIP-3009 signature `exact`
    // settles, so it needs its own scheme. One facilitator should be able to
    // take both rather than forcing the seller to run two.
    const contractPayers: SchemeNetworkFacilitator = {
      scheme: "contract-payer",
      caipFamily: "eip155:*",
      getExtra: () => undefined,
      getSigners: () => [ACCOUNT.address],
      verify: async () => ({ isValid: true }) as never,
      settle: async () => ({ success: true }) as never,
    };

    const facilitator = createSelfFacilitator({
      chain: arbitrumSepolia,
      account: ACCOUNT,
      schemes: [contractPayers],
    });
    const supported = await facilitator.getSupported();
    const schemes = supported.kinds.map((k) => k.scheme);
    expect(schemes).toContain("exact");
    expect(schemes).toContain("contract-payer");
  });

  it("refuses a malformed payment payload instead of settling it", async () => {
    const facilitator = createSelfFacilitator({ chain: arbitrumSepolia, account: ACCOUNT });
    const bogusRequirements = {
      scheme: "exact",
      network: "eip155:421614" as const,
      asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      amount: "10000",
      payTo: ACCOUNT.address,
      maxTimeoutSeconds: 300,
      extra: {},
    };
    const bogusPayload = {
      x402Version: 2,
      accepted: bogusRequirements,
      payload: { garbage: true },
    };
    // The upstream scheme throws on structurally invalid payloads; either way
    // nothing reaches the chain. Middleware maps this to a payment failure.
    await expect(
      facilitator.verify(bogusPayload as never, bogusRequirements as never),
    ).rejects.toThrow();
  });
});
