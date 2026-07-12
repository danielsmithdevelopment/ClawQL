import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { resolvePaymentsConfigPath } from "../config/paths.js";

export const PaymentsConfigSchema = z.object({
  tenantId: z.string().optional(),
  plan: z.enum(["free", "pro", "team", "enterprise"]).default("free"),
  stripe: z
    .object({
      accountId: z.string().optional(),
      publishableKey: z.string().optional(),
      webhookSecret: z.string().optional(),
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

export async function loadPaymentsConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentsConfig> {
  const path = resolvePaymentsConfigPath(env);
  try {
    const raw = await readFile(path, "utf8");
    return PaymentsConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return PaymentsConfigSchema.parse({});
    }
    throw err;
  }
}

export async function savePaymentsConfig(
  config: PaymentsConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = resolvePaymentsConfigPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export async function mergePaymentsConfig(
  patch: Partial<PaymentsConfig>,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ config: PaymentsConfig; path: string }> {
  const current = await loadPaymentsConfig(env);
  const config = PaymentsConfigSchema.parse({
    ...current,
    ...patch,
    stripe: { ...current.stripe, ...patch.stripe },
    x402: { ...current.x402, ...patch.x402 },
  });
  const path = await savePaymentsConfig(config, env);
  return { config, path };
}
