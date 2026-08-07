import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  Network,
  SchemeNetworkFacilitator,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { createPublicClient, createWalletClient, http } from "viem";
import type { Chain, LocalAccount } from "viem";

export type { FacilitatorClient } from "@x402/core/server";

export interface SelfFacilitatorConfig {
  /** The EVM chain to verify and settle on (any viem chain object). */
  chain: Chain;
  /**
   * Local wallet that submits settlement transactions and pays their gas.
   * With the EIP-3009 exact scheme this is what makes payers gasless.
   */
  account: LocalAccount;
  /** Optional RPC override. Defaults to the chain's public RPC. */
  rpcUrl?: string;
  /**
   * Factory addresses allowed for ERC-6492 smart wallet deployment.
   * Off by default; see @x402/evm ExactEvmSchemeConfig.
   */
  eip6492AllowedFactories?: string[];
  /**
   * Extra schemes to serve alongside `exact`, registered on the same network.
   *
   * `exact` settles an EIP-3009 signature, which means the payer must hold a
   * private key. A payer that is a contract has no key to sign with, so paying
   * from a smart account needs a scheme built for it. Pass one here and this
   * facilitator will serve both, letting one endpoint take payment from wallets
   * and from contracts without running two facilitators.
   */
  schemes?: SchemeNetworkFacilitator[];
}

/**
 * An x402 facilitator that runs inside your own process.
 *
 * Hosted facilitators only cover a handful of networks. This one works on any
 * EVM chain viem knows about: payment verification and settlement run against
 * the chain directly, signed by the account you provide. Plug the result into
 * any x402 resource server middleware that accepts a FacilitatorClient
 * (@x402/hono, @x402/express, @x402/next).
 *
 * @example
 * import { createSelfFacilitator } from "@mariano-aguero/x402-self-facilitator";
 * import { paymentMiddlewareFromConfig } from "@x402/hono";
 * import { privateKeyToAccount } from "viem/accounts";
 * import { arbitrumSepolia } from "viem/chains";
 *
 * const facilitator = createSelfFacilitator({
 *   chain: arbitrumSepolia,
 *   account: privateKeyToAccount(process.env.SELLER_PRIVATE_KEY),
 * });
 * app.use("/api/paid", paymentMiddlewareFromConfig(routes, facilitator, schemes));
 */
export function createSelfFacilitator(config: SelfFacilitatorConfig): FacilitatorClient {
  const { chain, account, rpcUrl } = config;
  const network: Network = `eip155:${chain.id}`;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  // Bridge viem clients to the FacilitatorEvmSigner surface @x402/evm expects.
  // The casts drop viem's chain/account generics, which are already fixed by
  // the clients above; the runtime call shapes match.
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    readContract: (args) => publicClient.readContract(args as never),
    verifyTypedData: (args) => publicClient.verifyTypedData(args as never),
    writeContract: (args) => walletClient.writeContract(args as never),
    sendTransaction: (args) => walletClient.sendTransaction(args as never),
    waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
    getCode: (args) => publicClient.getCode(args),
  });

  const facilitator = new x402Facilitator().register(
    network,
    new ExactEvmScheme(signer, {
      eip6492AllowedFactories: config.eip6492AllowedFactories,
    }),
  );

  for (const scheme of config.schemes ?? []) {
    facilitator.register(network, scheme);
  }

  return {
    verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
      return facilitator.verify(payload, requirements);
    },
    settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
      return facilitator.settle(payload, requirements);
    },
    async getSupported(): Promise<SupportedResponse> {
      // Delegate so supported kinds and signer addresses always reflect the
      // registered scheme. The facilitator types networks as plain strings;
      // ours is CAIP-2 by construction.
      return facilitator.getSupported() as SupportedResponse;
    },
  };
}
