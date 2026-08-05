/**
 * File-backed TOTP step-up enrollment store.
 * Callers choose the path (e.g. `$CLAWQL_HOME/Payments/step-up-totp.json`).
 * Never put secrets in payment WORM or audit logs.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from "./totp.js";

export type StepUpTotpEnrollment = {
  readonly subjectId: string;
  readonly secretBase32: string;
  readonly enrolledAt: string;
  readonly label?: string;
};

type StepUpFile = {
  subjects: Record<string, StepUpTotpEnrollment>;
};

async function loadFile(path: string): Promise<StepUpFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as StepUpFile & {
      /** @deprecated payments used `tenants` before the shared store. */
      tenants?: Record<string, StepUpTotpEnrollment & { tenantId?: string }>;
    };
    if (!parsed || typeof parsed !== "object") return { subjects: {} };
    if (parsed.subjects && typeof parsed.subjects === "object") {
      return { subjects: parsed.subjects };
    }
    // Migrate legacy payments shape `{ tenants: { [id]: { tenantId, ... } } }`
    if (parsed.tenants && typeof parsed.tenants === "object") {
      const subjects: Record<string, StepUpTotpEnrollment> = {};
      for (const [id, row] of Object.entries(parsed.tenants)) {
        subjects[id] = {
          subjectId: row.subjectId ?? row.tenantId ?? id,
          secretBase32: row.secretBase32,
          enrolledAt: row.enrolledAt,
          label: row.label,
        };
      }
      return { subjects };
    }
    return { subjects: {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { subjects: {} };
    throw err;
  }
}

async function saveFile(path: string, file: StepUpFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export type FileStepUpStore = {
  readonly path: string;
  getEnrollment(subjectId: string): Promise<StepUpTotpEnrollment | undefined>;
  enroll(input: {
    subjectId: string;
    label?: string;
    secretBase32?: string;
    issuer?: string;
  }): Promise<{ enrollment: StepUpTotpEnrollment; otpauthUrl: string; created: boolean }>;
  verify(subjectId: string, token: string): Promise<boolean>;
  require(subjectId: string, token: string | undefined, enrollHint?: string): Promise<void>;
};

export function createFileStepUpStore(path: string): FileStepUpStore {
  return {
    path,
    async getEnrollment(subjectId) {
      const id = subjectId.trim();
      if (!id) return undefined;
      const file = await loadFile(path);
      return file.subjects[id];
    },
    async enroll(input) {
      const subjectId = input.subjectId.trim();
      if (!subjectId) throw new Error("subjectId required");
      const file = await loadFile(path);
      const existing = file.subjects[subjectId];
      const issuer = input.issuer ?? "ClawQL";
      if (existing) {
        return {
          enrollment: existing,
          otpauthUrl: totpOtpauthUrl({
            secretBase32: existing.secretBase32,
            accountName: subjectId,
            issuer,
          }),
          created: false,
        };
      }
      const secretBase32 = input.secretBase32?.trim() || generateTotpSecret();
      const enrollment: StepUpTotpEnrollment = {
        subjectId,
        secretBase32,
        enrolledAt: new Date().toISOString(),
        label: input.label?.trim() || undefined,
      };
      file.subjects[subjectId] = enrollment;
      await saveFile(path, file);
      return {
        enrollment,
        otpauthUrl: totpOtpauthUrl({
          secretBase32,
          accountName: subjectId,
          issuer,
        }),
        created: true,
      };
    },
    async verify(subjectId, token) {
      const enrollment = await this.getEnrollment(subjectId);
      if (!enrollment) return false;
      return verifyTotp(enrollment.secretBase32, token);
    },
    async require(subjectId, token, enrollHint) {
      const enrollment = await this.getEnrollment(subjectId);
      if (!enrollment) {
        throw new Error(
          enrollHint ??
            `TOTP step-up required but subject ${subjectId} is not enrolled — enroll via clawql-auth step-up`
        );
      }
      if (!token?.trim()) {
        throw new Error("TOTP code required");
      }
      if (!verifyTotp(enrollment.secretBase32, token)) {
        throw new Error("Invalid TOTP code");
      }
    },
  };
}
