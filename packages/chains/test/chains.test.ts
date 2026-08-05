import { describe, expect, it } from "vitest";
import { getNetwork } from "../src/index.js";

describe("getNetwork", () => {
  it("defaults to arbitrum-sepolia", () => {
    const net = getNetwork(undefined);
    expect(net.key).toBe("arbitrum-sepolia");
    expect(net.caip).toBe("eip155:421614");
    expect(net.viemChain.id).toBe(421614);
  });

  it("resolves arbitrum mainnet with its canonical USDC address", () => {
    const net = getNetwork("arbitrum");
    expect(net.caip).toBe("eip155:42161");
    expect(net.usdc.address).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
    expect(net.usdc.decimals).toBe(6);
  });

  it("rejects unknown chains naming the variable", () => {
    expect(() => getNetwork("base")).toThrow(/CHAIN must be one of/);
  });
});
