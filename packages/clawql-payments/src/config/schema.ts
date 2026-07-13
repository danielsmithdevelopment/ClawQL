import { z } from "zod";

export const PaymentsConfigSchema = z.object({
  tenantId: z.string().optional(),
  plan: z.enum(["free", "pro", "team", "enterprise"]).default("free"),
  stripe: z
    .object({
      accountId: z.string().optional(),
      publishableKey: z.string().optional(),
      webhookSecret: z.string().optional(),
      customerId: z.string().optional(),
      meterEventName: z.string().optional(),
    })
    .default({}),
  x402: z
    .object({
      walletAddress: z.string().optional(),
      facilitatorUrl: z.string().url().optional(),
      defaultAsset: z.enum(["USDC"]).default("USDC"),
    })
    .default({ defaultAsset: "USDC" }),
});

export type PaymentsConfig = z.infer<typeof PaymentsConfigSchema>;
