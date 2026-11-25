/**
 * Audit 6.02: outbound payment HITL approvals are operator-recorded one-shots,
 * not agent-supplied quote digests.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";

export type OutboundOperatorApproval = {
  readonly id: string;
  readonly quoteDigest: string;
  readonly principal: string;
  readonly tenantId: string;
  readonly approvedAt: string;
  readonly consumedAt?: string;
};

function approvalsPath(home: string): string {
  return join(home, "Payments", "outbound-operator-approvals.json");
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

export function recordOutboundOperatorApprovalEffect(input: {
  home: string;
  quoteDigest: string;
  principal: string;
  tenantId: string;
}): Effect.Effect<OutboundOperatorApproval, Error> {
  return Effect.tryPromise({
    try: async () => {
      const principal = input.principal.trim();
      if (!principal) throw new Error("operator principal required");
      const quoteDigest = input.quoteDigest.trim();
      if (!quoteDigest) throw new Error("quoteDigest required");
      const store = await loadStore(input.home);
      const approval: OutboundOperatorApproval = {
        id: `x402apr_${randomBytes(12).toString("hex")}`,
        quoteDigest,
        principal,
        tenantId: input.tenantId.trim() || "default",
        approvedAt: new Date().toISOString(),
      };
      store.approvals.push(approval);
      await saveStore(input.home, store);
      return approval;
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function recordOutboundOperatorApproval(input: {
  home: string;
  quoteDigest: string;
  principal: string;
  tenantId: string;
}): Promise<OutboundOperatorApproval> {
  return Effect.runPromise(recordOutboundOperatorApprovalEffect(input));
}

/**
 * Consume a one-shot approval. Returns the approval when id+digest+tenant match
 * and it has not been consumed.
 */
export function consumeOutboundOperatorApprovalEffect(input: {
  home: string;
  approvalId: string;
  quoteDigest: string;
  tenantId: string;
}): Effect.Effect<OutboundOperatorApproval | null, Error> {
  return Effect.tryPromise({
    try: async () => {
      const store = await loadStore(input.home);
      const idx = store.approvals.findIndex((a) => a.id === input.approvalId);
      if (idx < 0) return null;
      const row = store.approvals[idx]!;
      if (row.consumedAt) return null;
      if (row.quoteDigest !== input.quoteDigest) return null;
      if (row.tenantId !== (input.tenantId.trim() || "default")) return null;
      const consumed: OutboundOperatorApproval = {
        ...row,
        consumedAt: new Date().toISOString(),
      };
      store.approvals[idx] = consumed;
      await saveStore(input.home, store);
      return consumed;
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export async function consumeOutboundOperatorApproval(input: {
  home: string;
  approvalId: string;
  quoteDigest: string;
  tenantId: string;
}): Promise<OutboundOperatorApproval | null> {
  return Effect.runPromise(consumeOutboundOperatorApprovalEffect(input));
}

/** Stable digest helper for tests / CLI. */
export function hashApprovalMaterial(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
