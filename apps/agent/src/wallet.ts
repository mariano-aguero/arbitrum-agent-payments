import { createPublicClient, erc20Abi, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { NetworkConfig } from "@arbitrum-agent-payments/chains";
import { formatUsdc } from "@arbitrum-agent-payments/chains";

export interface AgentWallet {
  address: `0x${string}`;
  network: NetworkConfig;
  /** Atomic USDC balance (6 decimals). */
  usdcBalance(): Promise<bigint>;
  balances(): Promise<{ usdc: string; eth: string; address: `0x${string}`; network: string }>;
  account: ReturnType<typeof privateKeyToAccount>;
}

/** Read-only wallet view. Signing happens inside the x402 client. */
export function createAgentWallet(
  privateKey: `0x${string}`,
  network: NetworkConfig,
  rpcUrl?: string,
): AgentWallet {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: network.viemChain,
    transport: http(rpcUrl),
  });

  const usdcBalance = () =>
    publicClient.readContract({
      address: network.usdc.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

  return {
    address: account.address,
    network,
    account,
    usdcBalance,
    async balances() {
      const [usdc, eth] = await Promise.all([
        usdcBalance(),
        publicClient.getBalance({ address: account.address }),
      ]);
      return {
        usdc: formatUsdc(usdc, network.usdc.decimals),
        eth: formatEther(eth),
        address: account.address,
        network: network.key,
      };
    },
  };
}
