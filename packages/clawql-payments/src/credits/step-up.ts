/**
 * Per-tenant TOTP step-up enrollment for high-impact credit transfers.
 * Uses clawql-auth shared file store — never put secrets in the payment WORM.
 */

import { createFileStepUpStore, type StepUpTotpEnrollment as AuthEnrollment } from "clawql-auth";
import { join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type StepUpTotpEnrollment = {
  readonly tenantId: string;
  readonly secretBase32: string;
  readonly enrolledAt: string;
  readonly label?: string;
};

export function resolveStepUpTotpPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "step-up-totp.json");
}

function store(env: NodeJS.ProcessEnv = process.env) {
  return createFileStepUpStore(resolveStepUpTotpPath(env));
}

function toTenantEnrollment(row: AuthEnrollment): StepUpTotpEnrollment {
  return {
    tenantId: row.subjectId,
    secretBase32: row.secretBase32,
    enrolledAt: row.enrolledAt,
    label: row.label,
  };
}

export async function getStepUpEnrollment(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<StepUpTotpEnrollment | undefined> {
  const row = await store(env).getEnrollment(tenantId);
  return row ? toTenantEnrollment(row) : undefined;
}

export async function enrollStepUpTotp(
  input: { tenantId: string; label?: string; secretBase32?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ enrollment: StepUpTotpEnrollment; otpauthUrl: string; created: boolean }> {
  const result = await store(env).enroll({
    subjectId: input.tenantId,
    label: input.label,
    secretBase32: input.secretBase32,
    issuer: "ClawQL Payments",
  });
  return {
    enrollment: toTenantEnrollment(result.enrollment),
    otpauthUrl: result.otpauthUrl,
    created: result.created,
  };
}

export async function verifyStepUpTotp(
  tenantId: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  return store(env).verify(tenantId, token);
}

export async function requireStepUpTotp(
  tenantId: string,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await store(env).require(
    tenantId,
    token,
    `TOTP step-up required but tenant ${tenantId} is not enrolled — run: clawql payments credits step-up enroll --tenant-id ${tenantId}`
  );
}
