import { createPublicClient, erc20Abi, formatEther, http } from "viem";
import type { Chain, LocalAccount } from "viem";

export interface X402WalletConfig {
  /** Chain the wallet reads balances from (any viem chain object). */
  chain: Chain;
  /** Payment token, e.g. USDC on the target chain. */
  token: { address: `0x${string}`; decimals?: number };
  /** Optional RPC override. Defaults to the chain's public RPC. */
  rpcUrl?: string;
}

export interface X402Wallet {
  address: `0x${string}`;
  account: LocalAccount;
  chain: Chain;
  tokenDecimals: number;
  /** Atomic token balance (e.g. 6-decimal units for USDC). */
  tokenBalance(): Promise<bigint>;
  balances(): Promise<{ token: string; native: string; address: `0x${string}`; chainId: number }>;
}

/** Read-only wallet view. Signing happens inside the x402 payment client. */
export function createX402Wallet(account: LocalAccount, config: X402WalletConfig): X402Wallet {
  const decimals = config.token.decimals ?? 6;
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const tokenBalance = () =>
    publicClient.readContract({
      address: config.token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

  return {
    address: account.address,
    account,
    chain: config.chain,
    tokenDecimals: decimals,
    tokenBalance,
    async balances() {
      const [token, native] = await Promise.all([
        tokenBalance(),
        publicClient.getBalance({ address: account.address }),
      ]);
      return {
        token: formatTokenAmount(token, decimals),
        native: formatEther(native),
        address: account.address,
        chainId: config.chain.id,
      };
    },
  };
}

/** Format an atomic token amount as a display string like "0.01". */
export function formatTokenAmount(atomic: bigint, decimals: number): string {
  const negative = atomic < 0n;
  const abs = negative ? -atomic : atomic;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
