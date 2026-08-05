import { z } from "zod";

const schema = z.object({
  SELLER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key"),
  CHAIN: z.enum(["arbitrum-sepolia", "arbitrum"]).default("arbitrum-sepolia"),
  PORT: z.coerce.number().int().positive().default(4021),
  RPC_URL: z.url().optional(),
});

export type SellerEnv = z.infer<typeof schema>;

/** Validate seller config up front so a bad .env fails before any network call. */
export function loadSellerEnv(source: NodeJS.ProcessEnv = process.env): SellerEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid seller environment: ${detail}`);
  }
  return result.data;
}
