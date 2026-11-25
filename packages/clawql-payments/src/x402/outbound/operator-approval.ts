/**
 * Audit 6.02 / X1–X3 / Y3: outbound payment HITL approvals are operator-recorded
 * one-shots with file locking, TTL expiry, and quote-bound parking.
 */

import { createHash, randomBytes } from "node:crypto";
import { open, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";

/** Quote snapshot parked when HITL is required (audit Y3). */
export type OutboundPendingQuote = {
  readonly quoteDigest: string;
  readonly amount: string;
  readonly asset: string;
  readonly payee: string;
  readonly resourceUrl: string;
  readonly network?: string;
  readonly tenantId: string;
  readonly parkedAt: string;
  readonly expiresAt: string;
};

export type OutboundOperatorApproval = {
  readonly id: string;
  readonly quoteDigest: string;
  readonly principal: string;
  readonly tenantId: string;
  readonly approvedAt: string;
  /** ISO expiry; consume refuses after this. */
  readonly expiresAt: string;
  /** Bound quote shown to the operator at approve time (audit Y3). */
  readonly quote: OutboundPendingQuote;
  readonly consumedAt?: string;
};

function approvalsPath(home: string): string {
  return join(home, "Payments", "outbound-operator-approvals.json");
}

function pendingQuotesPath(home: string): string {
  return join(home, "Payments", "outbound-pending-quotes.json");
}

function lockPath(home: string): string {
  return `${approvalsPath(home)}.lock`;
}

type StoreFile = { approvals: OutboundOperatorApproval[] };
type PendingStore = { quotes: OutboundPendingQuote[] };

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

async function loadPending(home: string): Promise<PendingStore> {
  try {
    const raw = await readFile(pendingQuotesPath(home), "utf8");
    const parsed = JSON.parse(raw) as PendingStore;
    return { quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [] };
  } catch {
    return { quotes: [] };
  }
}

async function savePending(home: string, store: PendingStore): Promise<void> {
  const dir = join(home, "Payments");
  await mkdir(dir, { recursive: true });
  await writeFile(pendingQuotesPath(home), `${JSON.stringify(store, null, 2)}\n`, {
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

export type ParkOutboundQuoteInput = {
  home: string;
  quoteDigest: string;
  amount: string;
  asset: string;
  payee: string;
  resourceUrl: string;
  network?: string;
  tenantId: string;
  env?: NodeJS.ProcessEnv;
};

/** Park quote details when HITL is required so operators are not approving blind (Y3). */
export function parkOutboundPendingQuoteEffect(
  input: ParkOutboundQuoteInput
): Effect.Effect<OutboundPendingQuote, Error> {
  return Effect.tryPromise({
    try: async () => {
      const quoteDigest = input.quoteDigest.trim();
      if (!quoteDigest) throw new Error("quoteDigest required");
      const env = input.env ?? process.env;
      const ttlSec = outboundApprovalTtlSec(env);
      const now = Date.now();
      const row: OutboundPendingQuote = {
        quoteDigest,
        amount: input.amount.trim(),
        asset: input.asset.trim(),
        payee: input.payee.trim(),
        resourceUrl: input.resourceUrl.trim(),
        network: input.network?.trim() || undefined,
        tenantId: input.tenantId.trim() || "default",
        parkedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlSec * 1000).toISOString(),
      };
      return withApprovalsLock(input.home, async () => {
        const store = await loadPending(input.home);
        const nowMs = Date.now();
        store.quotes = store.quotes.filter(
          (q) => q.quoteDigest !== quoteDigest && Date.parse(q.expiresAt) > nowMs
        );
        store.quotes.push(row);
        await savePending(input.home, store);
        return row;
      });
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function parkOutboundPendingQuote(
  input: ParkOutboundQuoteInput
): Promise<OutboundPendingQuote> {
  return Effect.runPromise(parkOutboundPendingQuoteEffect(input));
}

export function getOutboundPendingQuoteEffect(input: {
  home: string;
  quoteDigest: string;
  tenantId?: string;
  nowMs?: number;
}): Effect.Effect<OutboundPendingQuote | null, Error> {
  return Effect.tryPromise({
    try: async () => {
      const nowMs = input.nowMs ?? Date.now();
      return withApprovalsLock(input.home, async () => {
        const store = await loadPending(input.home);
        const row = store.quotes.find((q) => q.quoteDigest === input.quoteDigest.trim());
        if (!row) return null;
        if (Date.parse(row.expiresAt) <= nowMs) return null;
        if (input.tenantId !== undefined && row.tenantId !== (input.tenantId.trim() || "default")) {
          return null;
        }
        return row;
      });
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function getOutboundPendingQuote(input: {
  home: string;
  quoteDigest: string;
  tenantId?: string;
  nowMs?: number;
}): Promise<OutboundPendingQuote | null> {
  return Effect.runPromise(getOutboundPendingQuoteEffect(input));
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
      const tenantId = input.tenantId.trim() || "default";
      return withApprovalsLock(input.home, async () => {
        const pending = await loadPending(input.home);
        const quote = pending.quotes.find((q) => q.quoteDigest === quoteDigest);
        if (!quote) {
          throw new Error(
            "no parked quote for this digest — wait for a payment that requires HITL first (audit Y3)"
          );
        }
        if (Date.parse(quote.expiresAt) <= now) {
          throw new Error("parked quote expired — re-run the payment to park a fresh quote");
        }
        if (quote.tenantId !== tenantId) {
          throw new Error("parked quote tenant does not match operator tenant");
        }
        const approval: OutboundOperatorApproval = {
          id: `x402apr_${randomBytes(12).toString("hex")}`,
          quoteDigest,
          principal,
          tenantId,
          approvedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + ttlSec * 1000).toISOString(),
          quote,
        };
        const store = await loadStore(input.home);
        store.approvals.push(approval);
        await saveStore(input.home, store);
        // Drop the pending quote once approved (one approval attempt per park).
        pending.quotes = pending.quotes.filter((q) => q.quoteDigest !== quoteDigest);
        await savePending(input.home, pending);
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
        if (row.quote && row.quote.quoteDigest !== input.quoteDigest) return null;
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
