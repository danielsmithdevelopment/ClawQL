import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import type { PaymentWormEntry } from "../audit/events.js";
import { listPaymentAuditEntries, verifyPaymentAuditLog } from "../audit/worm.js";
import { resolvePaymentsDir } from "../config/paths.js";
import { resolveEntryAccounting } from "./classify.js";
import { getTaxProfile } from "./tax-profile.js";
import type { TaxEvidencePack, TaxEvidenceRow, TaxFormKind } from "./types.js";

const EVIDENCE_KINDS = new Set([
  "PAYOUT_PAID",
  "COMPENSATION_CASHOUT_COMPLETED",
  "OFFRAMP_COMPLETED",
]);

const DISCLAIMER =
  "Evidence only — not an IRS/CRA e-file. Prefer Stripe Connect Tax for Connect 1099s; engage a CPA for filing. No SSNs are stored in this pack.";

export function resolveTaxEvidenceDir(
  taxYear: number,
  env: NodeJS.ProcessEnv = process.env
): string {
  return join(resolvePaymentsDir(env), "tax-evidence", String(taxYear));
}

function inTaxYear(ts: string, taxYear: number): boolean {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() === taxYear;
}

export type BuildTaxEvidencePackOptions = {
  taxYear: number;
  skipVerify?: boolean;
  limit?: number;
  env?: NodeJS.ProcessEnv;
};

/** @deprecated Prefer TaxEvidenceService.build — Promise façade retained for legacy callers. */
export async function buildTaxEvidencePack(
  options: BuildTaxEvidencePackOptions
): Promise<TaxEvidencePack> {
  const env = options.env ?? process.env;
  const taxYear = options.taxYear;
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    throw new Error("taxYear must be a 4-digit year");
  }

  if (!options.skipVerify) {
    const verify = await verifyPaymentAuditLog(env);
    if (!verify.ok) {
      throw new Error(
        `Payment audit chain failed — refuse tax evidence export (${verify.issues.length} issue(s))`
      );
    }
  }

  const entries = await listPaymentAuditEntries(options.limit ?? 100_000, env);
  const rows: TaxEvidenceRow[] = [];

  for (const entry of entries) {
    if (!EVIDENCE_KINDS.has(entry.action)) continue;
    if (!inTaxYear(entry.ts, taxYear)) continue;
    const accounting = resolveEntryAccounting(entry);
    const partyId = accounting.counterpartyId || entry.payload.agent_id || "";
    const profile = partyId ? await getTaxProfile(partyId, env) : undefined;
    const usd = entry.payload.amount_usd;
    const usdc = entry.payload.amount_usdc;
    const push = (amount: number, currency: "USD" | "USDC") => {
      rows.push({
        date: entry.ts,
        eventKind: entry.action,
        partyId,
        amount,
        currency,
        paymentMethod: entry.payload.provider,
        resource: entry.payload.resource ?? "",
        correlationId: entry.correlationId ?? "",
        taxForm: (profile?.taxForm ?? "unknown") as TaxFormKind,
        taxProfileCollected: Boolean(profile?.collected),
        taxProfileRef: profile?.taxProfileRef ?? "",
      });
    };
    if (typeof usd === "number" && Number.isFinite(usd) && usd !== 0) push(usd, "USD");
    if (typeof usdc === "number" && Number.isFinite(usdc) && usdc !== 0) push(usdc, "USDC");
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.partyId.localeCompare(b.partyId));

  return {
    taxYear,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    totalUsd: rows.filter((r) => r.currency === "USD").reduce((s, r) => s + r.amount, 0),
    totalUsdc: rows.filter((r) => r.currency === "USDC").reduce((s, r) => s + r.amount, 0),
    rows,
    disclaimer: DISCLAIMER,
  };
}

export function formatTaxEvidenceMarkdown(pack: TaxEvidencePack): string {
  const lines = [
    `# Tax evidence pack — ${pack.taxYear}`,
    "",
    `Generated: ${pack.generatedAt}`,
    "",
    `> ${pack.disclaimer}`,
    "",
    `| Date | Kind | Party | Amount | Currency | Method | Tax form | Collected | Ref |`,
    `| ---- | ---- | ----- | ------ | -------- | ------ | -------- | --------- | --- |`,
  ];
  for (const r of pack.rows) {
    lines.push(
      `| ${r.date.slice(0, 10)} | ${r.eventKind} | ${r.partyId || "—"} | ${r.amount} | ${r.currency} | ${r.paymentMethod} | ${r.taxForm} | ${r.taxProfileCollected ? "yes" : "no"} | ${r.taxProfileRef || "—"} |`
    );
  }
  lines.push(
    "",
    `**Totals:** $${pack.totalUsd.toFixed(2)} USD, ${pack.totalUsdc} USDC across ${pack.rowCount} row(s).`,
    ""
  );
  return lines.join("\n");
}

/** @deprecated Prefer TaxEvidenceService.write — Promise façade retained for legacy callers. */
export async function writeTaxEvidencePack(
  pack: TaxEvidencePack,
  env: NodeJS.ProcessEnv = process.env,
  outputDir?: string
): Promise<{ jsonPath: string; mdPath: string }> {
  const dir = outputDir?.trim() || resolveTaxEvidenceDir(pack.taxYear, env);
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, "evidence.json");
  const mdPath = join(dir, "evidence.md");
  await writeFile(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatTaxEvidenceMarkdown(pack), "utf8");
  return { jsonPath, mdPath };
}

/** @internal test helper */
export function isEvidenceKind(entry: PaymentWormEntry): boolean {
  return EVIDENCE_KINDS.has(entry.action);
}

export class TaxEvidenceError extends Data.TaggedError("TaxEvidenceError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Effect surface over 1099-style tax evidence packs (WORM audit → JSON/Markdown).
 * Evidence only — never an IRS/CRA e-file; `build` refuses when the audit chain fails.
 */
export class TaxEvidenceService extends Context.Tag("clawql/TaxEvidenceService")<
  TaxEvidenceService,
  {
    readonly build: (
      options: BuildTaxEvidencePackOptions
    ) => Effect.Effect<TaxEvidencePack, TaxEvidenceError>;
    readonly write: (
      pack: TaxEvidencePack,
      outputDir?: string
    ) => Effect.Effect<{ jsonPath: string; mdPath: string }, TaxEvidenceError>;
    readonly formatMarkdown: (pack: TaxEvidencePack) => Effect.Effect<string, TaxEvidenceError>;
  }
>() {}

export function taxEvidenceLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TaxEvidenceService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof TaxEvidenceError
          ? cause
          : new TaxEvidenceError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    TaxEvidenceService,
    TaxEvidenceService.of({
      build: (options) =>
        run("Failed to build tax evidence pack", () =>
          buildTaxEvidencePack({ ...options, env: options.env ?? env })
        ),
      write: (pack, outputDir) =>
        run("Failed to write tax evidence pack", () => writeTaxEvidencePack(pack, env, outputDir)),
      formatMarkdown: (pack) =>
        Effect.try({
          try: () => formatTaxEvidenceMarkdown(pack),
          catch: (cause) =>
            new TaxEvidenceError({
              reason: cause instanceof Error ? cause.message : "Failed to format tax evidence",
              cause,
            }),
        }),
    })
  );
}
