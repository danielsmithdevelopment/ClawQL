/**
 * Prepaid credit ledger: grant buckets + holds + append-only entries.
 * Authoritative balances live here (Postgres/Valkey scale-out later).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveCreditsLedgerPath } from "../config/paths.js";

export type CreditLedgerKind =
  | "topup_pending"
  | "topup_settled"
  | "topup_failed"
  | "debit"
  | "adjust"
  | "hold"
  | "capture"
  | "release"
  | "grant";

export type CreditGrantSource = "plan" | "topup" | "promo" | "rollover" | "adjust";

export type CreditGrant = {
  readonly id: string;
  readonly source: CreditGrantSource;
  readonly balanceCents: number;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly note?: string;
};

export type CreditHoldAllocation = {
  readonly grantId: string;
  readonly cents: number;
};

export type CreditHoldStatus = "held" | "captured" | "released";

export type CreditHold = {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly amountCents: number;
  readonly status: CreditHoldStatus;
  readonly allocations: readonly CreditHoldAllocation[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly correlationId?: string;
  readonly resource?: string;
  readonly note?: string;
};

export type CreditLedgerEntry = {
  readonly id: string;
  readonly ts: string;
  readonly tenantId: string;
  readonly kind: CreditLedgerKind;
  /** Signed delta in USD cents (positive = credit, negative = debit). */
  readonly deltaCents: number;
  readonly balanceAfterCents: number;
  readonly paymentIntentId?: string;
  readonly financialConnectionsSessionId?: string;
  readonly correlationId?: string;
  readonly note?: string;
  readonly idempotencyKey?: string;
  readonly holdId?: string;
};

export type CreditAccount = {
  readonly tenantId: string;
  readonly balanceCents: number;
  readonly updatedAt: string;
  readonly grants: CreditGrant[];
  readonly holds: CreditHold[];
  readonly entries: CreditLedgerEntry[];
};

type LedgerFile = {
  accounts: Record<string, CreditAccount>;
};

export { resolveCreditsLedgerPath };

/** Source priority for waterfall (lower = deduct first). Expiry still wins. */
const SOURCE_PRIORITY: Record<CreditGrantSource, number> = {
  promo: 0,
  plan: 1,
  topup: 2,
  rollover: 3,
  adjust: 4,
};

const tenantLocks = new Map<string, Promise<unknown>>();

export async function withTenantLedgerLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const key = tenantId.trim() || "default";
  const prev = tenantLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  tenantLocks.set(
    key,
    chained.catch(() => undefined)
  );
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (tenantLocks.get(key) === chained) {
      tenantLocks.delete(key);
    }
  }
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<LedgerFile> {
  const path = resolveCreditsLedgerPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as LedgerFile;
    if (!parsed || typeof parsed !== "object" || !parsed.accounts) {
      return { accounts: {} };
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { accounts: {} };
    }
    throw err;
  }
}

async function saveFile(file: LedgerFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveCreditsLedgerPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

function emptyAccount(tenantId: string): CreditAccount {
  return {
    tenantId,
    balanceCents: 0,
    updatedAt: new Date().toISOString(),
    grants: [],
    holds: [],
    entries: [],
  };
}

function isGrantActive(grant: CreditGrant, now: Date): boolean {
  if (grant.balanceCents <= 0) return false;
  if (!grant.expiresAt) return true;
  return new Date(grant.expiresAt).getTime() > now.getTime();
}

function sortGrantsForDeduction(grants: CreditGrant[], now: Date): CreditGrant[] {
  return [...grants]
    .filter((g) => isGrantActive(g, now))
    .sort((a, b) => {
      const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      if (ax !== bx) return ax - bx;
      return SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    });
}

function sumGrants(grants: readonly CreditGrant[], now: Date): number {
  return grants.reduce((sum, g) => sum + (isGrantActive(g, now) ? g.balanceCents : 0), 0);
}

function normalizeAccount(tenantId: string, raw: CreditAccount | undefined): CreditAccount {
  if (!raw) return emptyAccount(tenantId);
  const grants = Array.isArray(raw.grants) ? [...raw.grants] : [];
  const holds = Array.isArray(raw.holds) ? [...raw.holds] : [];
  const entries = Array.isArray(raw.entries) ? [...raw.entries] : [];
  const now = new Date();
  // Migrate legacy single-balance accounts into one topup grant.
  if (grants.length === 0 && (raw.balanceCents ?? 0) > 0) {
    grants.push({
      id: `grant_legacy_${tenantId}`,
      source: "topup",
      balanceCents: raw.balanceCents,
      createdAt: raw.updatedAt || now.toISOString(),
      note: "migrated from legacy balanceCents",
    });
  }
  const balanceCents = sumGrants(grants, now);
  return {
    tenantId,
    balanceCents,
    updatedAt: raw.updatedAt || now.toISOString(),
    grants,
    holds,
    entries,
  };
}

export function spendableBalanceCents(account: CreditAccount, now: Date = new Date()): number {
  const held = account.holds
    .filter((h) => h.status === "held")
    .reduce((sum, h) => sum + h.amountCents, 0);
  // Holds already deducted from grants in this model; spendable is grant sum.
  void held;
  return sumGrants(account.grants, now);
}

export async function getCreditAccount(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditAccount> {
  const file = await loadFile(env);
  return normalizeAccount(tenantId, file.accounts[tenantId]);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function applyWaterfallDeduct(
  grants: CreditGrant[],
  amountCents: number,
  now: Date
): { grants: CreditGrant[]; allocations: CreditHoldAllocation[] } {
  let remaining = amountCents;
  const allocations: CreditHoldAllocation[] = [];
  const ordered = sortGrantsForDeduction(grants, now);
  const byId = new Map(grants.map((g) => [g.id, { ...g }]));
  for (const g of ordered) {
    if (remaining <= 0) break;
    const cur = byId.get(g.id);
    if (!cur || cur.balanceCents <= 0) continue;
    const take = Math.min(cur.balanceCents, remaining);
    byId.set(g.id, { ...cur, balanceCents: cur.balanceCents - take });
    allocations.push({ grantId: g.id, cents: take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(
      `Insufficient credits: need ${amountCents}c, short ${remaining}c after waterfall`
    );
  }
  return { grants: [...byId.values()], allocations };
}

function applyAllocationsCredit(
  grants: CreditGrant[],
  allocations: readonly CreditHoldAllocation[]
): CreditGrant[] {
  const byId = new Map(grants.map((g) => [g.id, { ...g }]));
  for (const a of allocations) {
    const cur = byId.get(a.grantId);
    if (cur) {
      byId.set(a.grantId, { ...cur, balanceCents: cur.balanceCents + a.cents });
    } else {
      byId.set(a.grantId, {
        id: a.grantId,
        source: "adjust",
        balanceCents: a.cents,
        createdAt: new Date().toISOString(),
        note: "release restored missing grant",
      });
    }
  }
  return [...byId.values()];
}

export async function appendCreditEntry(
  input: {
    tenantId: string;
    kind: CreditLedgerKind;
    deltaCents: number;
    paymentIntentId?: string;
    financialConnectionsSessionId?: string;
    correlationId?: string;
    note?: string;
    id?: string;
    idempotencyKey?: string;
    holdId?: string;
    grantSource?: CreditGrantSource;
    expiresAt?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditLedgerEntry> {
  return withTenantLedgerLock(input.tenantId, async () => {
    const file = await loadFile(env);
    let account = normalizeAccount(input.tenantId, file.accounts[input.tenantId]);
    const now = new Date();
    let grants = account.grants;

    if (input.deltaCents > 0) {
      grants = [
        ...grants,
        {
          id: newId("grant"),
          source: input.grantSource ?? (input.kind === "topup_settled" ? "topup" : "adjust"),
          balanceCents: input.deltaCents,
          createdAt: now.toISOString(),
          expiresAt: input.expiresAt,
          note: input.note,
        },
      ];
    } else if (input.deltaCents < 0) {
      const deducted = applyWaterfallDeduct(grants, -input.deltaCents, now);
      grants = deducted.grants;
    }

    const balanceAfterCents = sumGrants(grants, now);
    if (balanceAfterCents < 0) {
      throw new Error(
        `Insufficient credits for tenant ${input.tenantId}: balance ${account.balanceCents}c, delta ${input.deltaCents}c`
      );
    }

    const entry: CreditLedgerEntry = {
      id: input.id?.trim() || newId("cred"),
      ts: now.toISOString(),
      tenantId: account.tenantId,
      kind: input.kind,
      deltaCents: input.deltaCents,
      balanceAfterCents,
      paymentIntentId: input.paymentIntentId,
      financialConnectionsSessionId: input.financialConnectionsSessionId,
      correlationId: input.correlationId,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      holdId: input.holdId,
    };
    account = {
      ...account,
      grants,
      balanceCents: balanceAfterCents,
      updatedAt: entry.ts,
      entries: [...account.entries, entry],
    };
    file.accounts[input.tenantId] = account;
    await saveFile(file, env);
    return entry;
  });
}

export type HoldResult = {
  hold: CreditHold;
  entry: CreditLedgerEntry;
  alreadyExisted: boolean;
  spendableAfterCents: number;
};

export async function holdCredits(
  input: {
    tenantId: string;
    amountCents: number;
    idempotencyKey: string;
    correlationId?: string;
    resource?: string;
    note?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<HoldResult> {
  return withTenantLedgerLock(input.tenantId, async () => {
    const file = await loadFile(env);
    let account = normalizeAccount(input.tenantId, file.accounts[input.tenantId]);
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("idempotencyKey required");
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      throw new Error("amountCents must be > 0");
    }

    const existing = account.holds.find((h) => h.idempotencyKey === key);
    if (existing) {
      const entry =
        account.entries.find((e) => e.idempotencyKey === key && e.kind === "hold") ??
        account.entries[account.entries.length - 1]!;
      return {
        hold: existing,
        entry,
        alreadyExisted: true,
        spendableAfterCents: account.balanceCents,
      };
    }

    const now = new Date();
    const { grants, allocations } = applyWaterfallDeduct(
      account.grants,
      Math.round(input.amountCents),
      now
    );
    const hold: CreditHold = {
      id: newId("hold"),
      idempotencyKey: key,
      amountCents: Math.round(input.amountCents),
      status: "held",
      allocations,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      correlationId: input.correlationId,
      resource: input.resource,
      note: input.note,
    };
    const entry: CreditLedgerEntry = {
      id: newId("cred"),
      ts: now.toISOString(),
      tenantId: account.tenantId,
      kind: "hold",
      deltaCents: -hold.amountCents,
      balanceAfterCents: sumGrants(grants, now),
      correlationId: input.correlationId,
      note: input.note ?? input.resource,
      idempotencyKey: key,
      holdId: hold.id,
    };
    account = {
      ...account,
      grants,
      holds: [...account.holds, hold],
      balanceCents: entry.balanceAfterCents,
      updatedAt: entry.ts,
      entries: [...account.entries, entry],
    };
    file.accounts[input.tenantId] = account;
    await saveFile(file, env);
    return {
      hold,
      entry,
      alreadyExisted: false,
      spendableAfterCents: account.balanceCents,
    };
  });
}

export type CaptureResult = {
  hold: CreditHold;
  entry: CreditLedgerEntry;
  refundedCents: number;
  alreadyCaptured: boolean;
};

export async function captureHold(
  input: {
    tenantId: string;
    idempotencyKey: string;
    actualAmountCents?: number;
    correlationId?: string;
    note?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CaptureResult> {
  return withTenantLedgerLock(input.tenantId, async () => {
    const file = await loadFile(env);
    let account = normalizeAccount(input.tenantId, file.accounts[input.tenantId]);
    const key = input.idempotencyKey.trim();
    const holdIdx = account.holds.findIndex((h) => h.idempotencyKey === key);
    if (holdIdx < 0) throw new Error(`Unknown hold idempotencyKey: ${key}`);
    const hold = account.holds[holdIdx]!;
    if (hold.status === "captured") {
      const entry =
        account.entries.find((e) => e.holdId === hold.id && e.kind === "capture") ??
        account.entries[account.entries.length - 1]!;
      return { hold, entry, refundedCents: 0, alreadyCaptured: true };
    }
    if (hold.status === "released") {
      throw new Error(`Hold ${hold.id} already released`);
    }

    const now = new Date();
    const actual =
      input.actualAmountCents === undefined
        ? hold.amountCents
        : Math.round(input.actualAmountCents);
    if (actual < 0 || actual > hold.amountCents) {
      throw new Error(`actualAmountCents must be 0..${hold.amountCents}`);
    }
    const refundedCents = hold.amountCents - actual;
    let grants = account.grants;
    if (refundedCents > 0) {
      // Refund unused estimate proportionally from allocations (tail first).
      let left = refundedCents;
      const reverse = [...hold.allocations].reverse();
      const refundAlloc: CreditHoldAllocation[] = [];
      for (const a of reverse) {
        if (left <= 0) break;
        const give = Math.min(a.cents, left);
        refundAlloc.push({ grantId: a.grantId, cents: give });
        left -= give;
      }
      grants = applyAllocationsCredit(grants, refundAlloc);
    }

    const nextHold: CreditHold = {
      ...hold,
      status: "captured",
      amountCents: actual,
      updatedAt: now.toISOString(),
    };
    const holds = [...account.holds];
    holds[holdIdx] = nextHold;

    const entry: CreditLedgerEntry = {
      id: newId("cred"),
      ts: now.toISOString(),
      tenantId: account.tenantId,
      kind: "capture",
      deltaCents: refundedCents,
      balanceAfterCents: sumGrants(grants, now),
      correlationId: input.correlationId ?? hold.correlationId,
      note: input.note ?? `capture hold ${hold.id}`,
      idempotencyKey: key,
      holdId: hold.id,
    };
    account = {
      ...account,
      grants,
      holds,
      balanceCents: entry.balanceAfterCents,
      updatedAt: entry.ts,
      entries: [...account.entries, entry],
    };
    file.accounts[input.tenantId] = account;
    await saveFile(file, env);
    return { hold: nextHold, entry, refundedCents, alreadyCaptured: false };
  });
}

export type ReleaseResult = {
  hold: CreditHold;
  entry: CreditLedgerEntry;
  alreadyReleased: boolean;
};

export async function releaseHold(
  input: {
    tenantId: string;
    idempotencyKey: string;
    correlationId?: string;
    note?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<ReleaseResult> {
  return withTenantLedgerLock(input.tenantId, async () => {
    const file = await loadFile(env);
    let account = normalizeAccount(input.tenantId, file.accounts[input.tenantId]);
    const key = input.idempotencyKey.trim();
    const holdIdx = account.holds.findIndex((h) => h.idempotencyKey === key);
    if (holdIdx < 0) throw new Error(`Unknown hold idempotencyKey: ${key}`);
    const hold = account.holds[holdIdx]!;
    if (hold.status === "released") {
      const entry =
        account.entries.find((e) => e.holdId === hold.id && e.kind === "release") ??
        account.entries[account.entries.length - 1]!;
      return { hold, entry, alreadyReleased: true };
    }
    if (hold.status === "captured") {
      throw new Error(`Hold ${hold.id} already captured`);
    }

    const now = new Date();
    const grants = applyAllocationsCredit(account.grants, hold.allocations);
    const nextHold: CreditHold = {
      ...hold,
      status: "released",
      updatedAt: now.toISOString(),
    };
    const holds = [...account.holds];
    holds[holdIdx] = nextHold;
    const entry: CreditLedgerEntry = {
      id: newId("cred"),
      ts: now.toISOString(),
      tenantId: account.tenantId,
      kind: "release",
      deltaCents: hold.amountCents,
      balanceAfterCents: sumGrants(grants, now),
      correlationId: input.correlationId ?? hold.correlationId,
      note: input.note ?? `release hold ${hold.id}`,
      idempotencyKey: key,
      holdId: hold.id,
    };
    account = {
      ...account,
      grants,
      holds,
      balanceCents: entry.balanceAfterCents,
      updatedAt: entry.ts,
      entries: [...account.entries, entry],
    };
    file.accounts[input.tenantId] = account;
    await saveFile(file, env);
    return { hold: nextHold, entry, alreadyReleased: false };
  });
}

/** Idempotent settle: if PI already settled, return existing entry. */
export async function settleTopupByPaymentIntent(
  input: {
    tenantId: string;
    paymentIntentId: string;
    amountCents: number;
    correlationId?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: CreditLedgerEntry; alreadySettled: boolean }> {
  return withTenantLedgerLock(input.tenantId, async () => {
    const file = await loadFile(env);
    let account = normalizeAccount(input.tenantId, file.accounts[input.tenantId]);
    const existing = account.entries.find(
      (e) => e.paymentIntentId === input.paymentIntentId && e.kind === "topup_settled"
    );
    if (existing) {
      return { entry: existing, alreadySettled: true };
    }
    const now = new Date();
    const grant: CreditGrant = {
      id: `grant_pi_${input.paymentIntentId}`,
      source: "topup",
      balanceCents: input.amountCents,
      createdAt: now.toISOString(),
      note: "ACH top-up settled",
    };
    const grants = [...account.grants, grant];
    const entry: CreditLedgerEntry = {
      id: `settle_${input.paymentIntentId}`,
      ts: now.toISOString(),
      tenantId: account.tenantId,
      kind: "topup_settled",
      deltaCents: input.amountCents,
      balanceAfterCents: sumGrants(grants, now),
      paymentIntentId: input.paymentIntentId,
      correlationId: input.correlationId,
      note: "ACH top-up settled",
    };
    account = {
      ...account,
      grants,
      balanceCents: entry.balanceAfterCents,
      updatedAt: entry.ts,
      entries: [...account.entries, entry],
    };
    file.accounts[input.tenantId] = account;
    await saveFile(file, env);
    return { entry, alreadySettled: false };
  });
}

export async function resetCreditsLedgerForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await saveFile({ accounts: {} }, env);
}
