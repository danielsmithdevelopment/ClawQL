/**
 * Local prepaid credit ledger (USD minor units).
 * Append-only entries under `$CLAWQL_HOME/Payments/credits-ledger.json`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveCreditsLedgerPath } from "../config/paths.js";

export type CreditLedgerKind =
  "topup_pending" | "topup_settled" | "topup_failed" | "debit" | "adjust";

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
};

export type CreditAccount = {
  readonly tenantId: string;
  readonly balanceCents: number;
  readonly updatedAt: string;
  readonly entries: CreditLedgerEntry[];
};

type LedgerFile = {
  accounts: Record<string, CreditAccount>;
};

export { resolveCreditsLedgerPath };

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
    entries: [],
  };
}

export async function getCreditAccount(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditAccount> {
  const file = await loadFile(env);
  return file.accounts[tenantId] ?? emptyAccount(tenantId);
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
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditLedgerEntry> {
  const file = await loadFile(env);
  const prev = file.accounts[input.tenantId] ?? emptyAccount(input.tenantId);
  const balanceAfterCents = prev.balanceCents + input.deltaCents;
  if (balanceAfterCents < 0) {
    throw new Error(
      `Insufficient credits for tenant ${input.tenantId}: balance ${prev.balanceCents}c, delta ${input.deltaCents}c`
    );
  }
  const entry: CreditLedgerEntry = {
    id:
      input.id?.trim() ||
      `cred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    tenantId: input.tenantId,
    kind: input.kind,
    deltaCents: input.deltaCents,
    balanceAfterCents,
    paymentIntentId: input.paymentIntentId,
    financialConnectionsSessionId: input.financialConnectionsSessionId,
    correlationId: input.correlationId,
    note: input.note,
  };
  file.accounts[input.tenantId] = {
    tenantId: input.tenantId,
    balanceCents: balanceAfterCents,
    updatedAt: entry.ts,
    entries: [...prev.entries, entry],
  };
  await saveFile(file, env);
  return entry;
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
  const account = await getCreditAccount(input.tenantId, env);
  const existing = account.entries.find(
    (e) => e.paymentIntentId === input.paymentIntentId && e.kind === "topup_settled"
  );
  if (existing) {
    return { entry: existing, alreadySettled: true };
  }
  const entry = await appendCreditEntry(
    {
      tenantId: input.tenantId,
      kind: "topup_settled",
      deltaCents: input.amountCents,
      paymentIntentId: input.paymentIntentId,
      correlationId: input.correlationId,
      note: "ACH top-up settled",
      id: `settle_${input.paymentIntentId}`,
    },
    env
  );
  return { entry, alreadySettled: false };
}

export async function resetCreditsLedgerForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await saveFile({ accounts: {} }, env);
}
