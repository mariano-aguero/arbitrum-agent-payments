import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "required, get one at platform.claude.com"),
  AGENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key"),
  CHAIN: z.enum(["arbitrum-sepolia", "arbitrum"]).default("arbitrum-sepolia"),
  API_BASE_URL: z.url().default("http://localhost:4021"),
  RPC_URL: z.url().optional(),
});

export type AgentEnv = z.infer<typeof schema>;

/** Validate agent config up front so a bad .env fails before any network call. */
export function loadAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid agent environment: ${detail}`);
  }
  return result.data;
}
