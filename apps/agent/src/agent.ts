import Anthropic from "@anthropic-ai/sdk";
import type { X402Tools } from "@mariano-aguero/anthropic-x402-tools";

export const AGENT_MODEL = "claude-opus-5";

export interface RunAgentOptions {
  client: Anthropic;
  tools: X402Tools["tools"];
  apiBase: string;
  prompt: string;
  onText?: (text: string) => void;
}

const systemPrompt = (apiBase: string) =>
  `You are a demo assistant that answers questions using a small API at ${apiBase}.
${apiBase}/api/free returns a basic status message; ${apiBase}/api/insight returns a premium insight and costs $0.01 USDC, paid from your own testnet wallet.
Payments are real Arbitrum Sepolia transactions: after making one, tell the user the amount and the transaction hash from the tool result. If a payment fails, explain why in plain terms.`;

/** One conversational turn: the tool runner loops until Claude stops calling tools. */
export async function runAgent({
  client,
  tools,
  apiBase,
  prompt,
  onText,
}: RunAgentOptions): Promise<string> {
  const runner = client.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 16000,
    system: systemPrompt(apiBase),
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  const finalMessage = await runner;
  const text = finalMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  onText?.(text);
  return text;
}
