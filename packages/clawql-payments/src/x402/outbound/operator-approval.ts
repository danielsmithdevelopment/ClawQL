/**
 * Audit 6.02 / X1–X3: outbound payment HITL approvals are operator-recorded
 * one-shots with file locking and TTL expiry.
 */

import { createHash, randomBytes } from "node:crypto";
import { open, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";

export type OutboundOperatorApproval = {
  readonly id: string;
  readonly quoteDigest: string;
  readonly principal: string;
  readonly tenantId: string;
  readonly approvedAt: string;
  /** ISO expiry; consume refuses after this. */
  readonly expiresAt: string;
  readonly consumedAt?: string;
};

function approvalsPath(home: string): string {
  return join(home, "Payments", "outbound-operator-approvals.json");
}

function lockPath(home: string): string {
  return `${approvalsPath(home)}.lock`;
}

type StoreFile = { approvals: OutboundOperatorApproval[] };

async function loadStore(home: string): Promise<StoreFile> {
  try {
    const raw = await readFile(approvalsPath(home), "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return { approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [] };
  } catch {
    return { approvals: [] };
  }
}

async function saveStore(home: string, store: StoreFile): Promise<void> {
  const dir = join(home, "Payments");
  await mkdir(dir, { recursive: true });
  await writeFile(approvalsPath(home), `${JSON.stringify(store, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** Default TTL 15 minutes; override with CLAWQL_OUTBOUND_APPROVAL_TTL_SEC. */
export function outboundApprovalTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_OUTBOUND_APPROVAL_TTL_SEC?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 900;
  if (!Number.isFinite(n) || n < 60) return 900;
  return Math.min(n, 86_400);
}

async function withApprovalsLock<T>(home: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(join(home, "Payments"), { recursive: true });
  const path = lockPath(home);
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const fh = await open(path, "wx");
      try {
        return await fn();
      } finally {
        await fh.close().catch(() => undefined);
        await unlink(path).catch(() => undefined);
      }
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code !== "EEXIST") {
        throw err instanceof Error ? err : new Error(String(err), { cause: err });
      }
      if (Date.now() > deadline) {
        throw new Error("outbound operator approval store lock timeout", { cause: err });
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

export function recordOutboundOperatorApprovalEffect(input: {
  home: string;
  quoteDigest: string;
  principal: string;
  tenantId: string;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<OutboundOperatorApproval, Error> {
  return Effect.tryPromise({
    try: async () => {
      const principal = input.principal.trim();
      if (!principal) throw new Error("operator principal required");
      const quoteDigest = input.quoteDigest.trim();
      if (!quoteDigest) throw new Error("quoteDigest required");
      const env = input.env ?? process.env;
      const ttlSec = outboundApprovalTtlSec(env);
      const now = Date.now();
      return withApprovalsLock(input.home, async () => {
        const store = await loadStore(input.home);
        const approval: OutboundOperatorApproval = {
          id: `x402apr_${randomBytes(12).toString("hex")}`,
          quoteDigest,
          principal,
          tenantId: input.tenantId.trim() || "default",
          approvedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + ttlSec * 1000).toISOString(),
        };
        store.approvals.push(approval);
        await saveStore(input.home, store);
        return approval;
      });
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function recordOutboundOperatorApproval(input: {
  home: string;
  quoteDigest: string;
  principal: string;
  tenantId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OutboundOperatorApproval> {
  return Effect.runPromise(recordOutboundOperatorApprovalEffect(input));
}

/**
 * Consume a one-shot approval under an exclusive lock. Returns null when
 * missing, already consumed, expired, or digest/tenant mismatch.
 */
export function consumeOutboundOperatorApprovalEffect(input: {
  home: string;
  approvalId: string;
  quoteDigest: string;
  tenantId: string;
  nowMs?: number;
}): Effect.Effect<OutboundOperatorApproval | null, Error> {
  return Effect.tryPromise({
    try: async () => {
      const nowMs = input.nowMs ?? Date.now();
      return withApprovalsLock(input.home, async () => {
        const store = await loadStore(input.home);
        const idx = store.approvals.findIndex((a) => a.id === input.approvalId);
        if (idx < 0) return null;
        const row = store.approvals[idx]!;
        if (row.consumedAt) return null;
        if (row.quoteDigest !== input.quoteDigest) return null;
        if (row.tenantId !== (input.tenantId.trim() || "default")) return null;
        if (Date.parse(row.expiresAt) <= nowMs) return null;
        const consumed: OutboundOperatorApproval = {
          ...row,
          consumedAt: new Date(nowMs).toISOString(),
        };
        store.approvals[idx] = consumed;
        await saveStore(input.home, store);
        return consumed;
      });
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function consumeOutboundOperatorApproval(input: {
  home: string;
  approvalId: string;
  quoteDigest: string;
  tenantId: string;
  nowMs?: number;
}): Promise<OutboundOperatorApproval | null> {
  return Effect.runPromise(consumeOutboundOperatorApprovalEffect(input));
}

/** Stable digest helper for tests / CLI. */
export function hashApprovalMaterial(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
