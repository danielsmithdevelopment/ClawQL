import { join } from "node:path";

export function resolveClawqlHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
}

export function resolvePaymentsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveClawqlHome(env), "Payments");
}

export function resolvePaymentsConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "payments.json");
}

export function resolveX402GatesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "x402-gates.json");
}

export function resolveUsagePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "usage.json");
}

export function resolvePaymentAuditJsonlPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "audit.jsonl");
}

export function resolvePaymentAuditMetaPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "audit.meta.json");
}
