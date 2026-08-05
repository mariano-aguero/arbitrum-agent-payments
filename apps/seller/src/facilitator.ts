import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { NetworkConfig } from "@arbitrum-agent-payments/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import type { Account } from "viem";

/**
 * In-process x402 facilitator.
 *
 * The public x402.org facilitator doesn't serve Arbitrum Sepolia, so this kit
 * embeds one inside the seller: verification and settlement run against the
 * chain directly, signed by the seller's own wallet. The buyer never pays gas:
 * EIP-3009 lets this wallet submit `transferWithAuthorization` on their behalf.
 */
export function createEmbeddedFacilitator(
  network: NetworkConfig,
  account: Account,
  rpcUrl?: string,
): FacilitatorClient {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: network.viemChain, transport });
  const walletClient = createWalletClient({
    account,
    chain: network.viemChain,
    transport,
  });

  const signer = toFacilitatorEvmSigner({
    address: account.address,
    readContract: (args) => publicClient.readContract(args as never),
    verifyTypedData: (args) => publicClient.verifyTypedData(args as never),
    writeContract: (args) => walletClient.writeContract(args as never),
    sendTransaction: (args) => walletClient.sendTransaction(args as never),
    waitForTransactionReceipt: (args) =>
      publicClient.waitForTransactionReceipt(args),
    getCode: (args) => publicClient.getCode(args),
  });

  const facilitator = new x402Facilitator().register(
    network.caip,
    new ExactEvmScheme(signer),
  );

  return {
    verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
      return facilitator.verify(payload, requirements);
    },
    settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
      return facilitator.settle(payload, requirements);
    },
    async getSupported(): Promise<SupportedResponse> {
      // Delegate so supported kinds and signer addresses always reflect
      // whatever schemes are actually registered above. The facilitator types
      // its networks as plain strings; ours are CAIP-2 by construction.
      return facilitator.getSupported() as SupportedResponse;
    },
  };
}
