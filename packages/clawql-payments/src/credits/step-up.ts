/**
 * Per-tenant TOTP step-up enrollment for high-impact credit transfers.
 * Stores opaque base32 secrets only — never put these in the payment WORM.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from "./totp.js";

export type StepUpTotpEnrollment = {
  readonly tenantId: string;
  readonly secretBase32: string;
  readonly enrolledAt: string;
  readonly label?: string;
};

type StepUpFile = {
  tenants: Record<string, StepUpTotpEnrollment>;
};

export function resolveStepUpTotpPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "step-up-totp.json");
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<StepUpFile> {
  try {
    const raw = await readFile(resolveStepUpTotpPath(env), "utf8");
    const parsed = JSON.parse(raw) as StepUpFile;
    if (!parsed || typeof parsed !== "object" || !parsed.tenants) return { tenants: {} };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { tenants: {} };
    throw err;
  }
}

async function saveFile(file: StepUpFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveStepUpTotpPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export async function getStepUpEnrollment(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<StepUpTotpEnrollment | undefined> {
  const file = await loadFile(env);
  return file.tenants[tenantId.trim()];
}

export async function enrollStepUpTotp(
  input: { tenantId: string; label?: string; secretBase32?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ enrollment: StepUpTotpEnrollment; otpauthUrl: string; created: boolean }> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("tenantId required");
  const file = await loadFile(env);
  const existing = file.tenants[tenantId];
  if (existing) {
    return {
      enrollment: existing,
      otpauthUrl: totpOtpauthUrl({
        secretBase32: existing.secretBase32,
        accountName: tenantId,
        issuer: "ClawQL Payments",
      }),
      created: false,
    };
  }
  const secretBase32 = input.secretBase32?.trim() || generateTotpSecret();
  const enrollment: StepUpTotpEnrollment = {
    tenantId,
    secretBase32,
    enrolledAt: new Date().toISOString(),
    label: input.label?.trim() || undefined,
  };
  file.tenants[tenantId] = enrollment;
  await saveFile(file, env);
  return {
    enrollment,
    otpauthUrl: totpOtpauthUrl({
      secretBase32,
      accountName: tenantId,
      issuer: "ClawQL Payments",
    }),
    created: true,
  };
}

export async function verifyStepUpTotp(
  tenantId: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const enrollment = await getStepUpEnrollment(tenantId, env);
  if (!enrollment) return false;
  return verifyTotp(enrollment.secretBase32, token);
}

export async function requireStepUpTotp(
  tenantId: string,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const enrollment = await getStepUpEnrollment(tenantId, env);
  if (!enrollment) {
    throw new Error(
      `TOTP step-up required but tenant ${tenantId} is not enrolled — run: clawql payments credits step-up enroll --tenant-id ${tenantId}`
    );
  }
  if (!token?.trim()) {
    throw new Error("TOTP code required — pass --totp NNNNNN");
  }
  if (!verifyTotp(enrollment.secretBase32, token)) {
    throw new Error("Invalid TOTP code");
  }
}
