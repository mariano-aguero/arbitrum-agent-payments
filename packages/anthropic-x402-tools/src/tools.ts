import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { formatTokenAmount, type X402Wallet } from "./wallet.js";

export interface PaymentRecord {
  url: string;
  amount: string;
  txHash: string;
}

export interface X402ToolDeps {
  wallet: X402Wallet;
  /** Plain fetch, used to probe for 402 challenges before committing funds. */
  plainFetch: typeof fetch;
  /** x402-wrapped fetch that pays automatically when challenged. */
  payingFetch: typeof fetch;
  /** Only URLs sharing this origin are ever fetched or paid. */
  apiBase: string;
  /** Every settled payment lands here so the caller can print a summary. */
  payments: PaymentRecord[];
  /** Overrides the fetch_url tool description shown to the model. */
  fetchToolDescription?: string;
}

const errorResult = (error: string, detail: string) => JSON.stringify({ error, detail });

/**
 * Build the two payment tools from explicit dependencies. Most callers want
 * createX402Tools from the package root, which wires the fetches and wallet
 * for you; this variant exists for tests and custom transports.
 */
export function createX402ToolsFromDeps(deps: X402ToolDeps) {
  const { wallet, apiBase, payments } = deps;
  const decimals = wallet.tokenDecimals;

  const fetchUrl = betaZodTool({
    name: "fetch_url",
    description:
      deps.fetchToolDescription ??
      `Fetch a URL from the API at ${apiBase}. If the endpoint requires payment, payment is handled automatically from your wallet; the result tells you what was paid. Call this when the user's question needs data from the API.`,
    inputSchema: z.object({
      url: z.string().describe("Absolute URL within the API base"),
    }),
    run: async ({ url }) => {
      // Compare origins, not string prefixes: "http://host:40210" and
      // "http://host:4021@evil.com" both pass a startsWith check.
      if (!isSameOrigin(url, apiBase)) {
        return errorResult("HTTP_ERROR", `URL must be within ${apiBase}`);
      }

      let probe: Response;
      try {
        probe = await deps.plainFetch(url);
      } catch (cause) {
        return errorResult("HTTP_ERROR", `request failed: ${String(cause)}`);
      }

      if (probe.status !== 402) {
        const body = await probe.json().catch(() => null);
        return JSON.stringify({ status: probe.status, body, payment: null });
      }

      // Challenged: check affordability before signing anything. In x402 v2
      // the requirements ride in the base64 payment-required header.
      const amount = readChallengeAmount(probe);
      if (amount === null) {
        return errorResult(
          "HTTP_ERROR",
          "got a 402 without a readable payment-required header; refusing to pay blind",
        );
      }
      const balance = await wallet.tokenBalance();
      if (balance < amount) {
        return errorResult(
          "INSUFFICIENT_FUNDS",
          `endpoint costs ${formatTokenAmount(amount, decimals)} but the wallet holds ${formatTokenAmount(balance, decimals)}`,
        );
      }

      let paid: Response;
      try {
        paid = await deps.payingFetch(url);
      } catch (cause) {
        return errorResult("SETTLEMENT_FAILED", String(cause));
      }
      if (!paid.ok) {
        return errorResult(
          "SETTLEMENT_FAILED",
          `paid request returned ${paid.status}: ${await paid.text().catch(() => "")}`,
        );
      }

      const body = await paid.json().catch(() => null);
      const receipt = readSettlement(paid);
      const payment = {
        made: true,
        amount: formatTokenAmount(amount, decimals),
        txHash: receipt ?? "unknown",
      };
      if (receipt) {
        payments.push({ url, amount: payment.amount, txHash: receipt });
      }
      return JSON.stringify({ status: paid.status, body, payment });
    },
  });

  const checkBalance = betaZodTool({
    name: "check_balance",
    description:
      "Check the wallet's current token and native balance on the active network. Call this before paid requests if the user asks about affordability, or after a payment fails.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify(await wallet.balances()),
  });

  return [fetchUrl, checkBalance];
}

/** True when url shares scheme, host and port with base. */
function isSameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/**
 * Read the challenged amount (atomic token units) from a 402 response.
 * Returns null when the challenge is missing or unreadable, so callers can
 * refuse instead of treating a broken challenge as "free".
 */
function readChallengeAmount(res: Response): bigint | null {
  const header = res.headers.get("payment-required");
  if (!header) return null;
  try {
    const decoded = decodePaymentRequiredHeader(header) as {
      accepts?: { amount?: string }[];
    };
    const amount = decoded.accepts?.[0]?.amount;
    return amount ? BigInt(amount) : null;
  } catch {
    return null;
  }
}

/** Pull the settlement tx hash out of the x402 payment-response header. */
function readSettlement(res: Response): string | null {
  const header =
    res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!header) return null;
  try {
    const decoded = decodePaymentResponseHeader(header) as { transaction?: string };
    return decoded.transaction ?? null;
  } catch {
    return null;
  }
}
