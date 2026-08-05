import { arbitrum, arbitrumSepolia } from "viem/chains";
import type { Chain } from "viem";
import { z } from "zod";

export const chainKeySchema = z.enum(["arbitrum-sepolia", "arbitrum"]);
export type ChainKey = z.infer<typeof chainKeySchema>;

export interface NetworkConfig {
  key: ChainKey;
  /** CAIP-2 network id, the format the x402 v2 packages use. */
  caip: `eip155:${number}`;
  viemChain: Chain;
  usdc: { address: `0x${string}`; decimals: number };
  explorerTxBase: string;
}

// USDC addresses match the defaults shipped in @x402/evm (DEFAULT_STABLECOINS),
// so sellers can price routes in dollars and let the scheme resolve the asset.
const networks: Record<ChainKey, NetworkConfig> = {
  "arbitrum-sepolia": {
    key: "arbitrum-sepolia",
    caip: "eip155:421614",
    viemChain: arbitrumSepolia,
    usdc: { address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", decimals: 6 },
    explorerTxBase: "https://sepolia.arbiscan.io/tx/",
  },
  arbitrum: {
    key: "arbitrum",
    caip: "eip155:42161",
    viemChain: arbitrum,
    usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    explorerTxBase: "https://arbiscan.io/tx/",
  },
};

/**
 * Resolve the active network from a CHAIN value.
 *
 * @example
 * const net = getNetwork(process.env.CHAIN) // defaults to arbitrum-sepolia
 */
export function getNetwork(chain?: string): NetworkConfig {
  const parsed = chainKeySchema.safeParse(chain ?? "arbitrum-sepolia");
  if (!parsed.success) {
    throw new Error(
      `CHAIN must be one of ${chainKeySchema.options.join(", ")}, got "${chain}"`,
    );
  }
  return networks[parsed.data];
}

/** Format an atomic USDC amount (6 decimals) as a display string like "0.01". */
export function formatUsdc(atomic: bigint, decimals = 6): string {
  const negative = atomic < 0n;
  const abs = negative ? -atomic : atomic;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
