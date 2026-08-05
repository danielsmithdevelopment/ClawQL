import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { PaymentWormEntry } from "../audit/events.js";
import { listPaymentAuditEntries, verifyPaymentAuditLog } from "../audit/worm.js";
import { entryHasMonetaryAmount, resolveEntryAccounting } from "./classify.js";
import { loadAccountingMap, resolveGlCode } from "./map.js";
import type {
  AccountingExportFormat,
  AccountingExportResult,
  AccountingExportRow,
} from "./types.js";

function parseBound(isoOrDate: string, endOfDay: boolean): number {
  const raw = isoOrDate.trim();
  if (!raw) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const hasTime = raw.includes("T");
  const d = new Date(hasTime ? raw : endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid date bound: ${isoOrDate}`);
  }
  return ms;
}

export function filterEntriesByPeriod(
  entries: PaymentWormEntry[],
  from: string,
  to: string
): PaymentWormEntry[] {
  const fromMs = parseBound(from, false);
  const toMs = parseBound(to, true);
  return entries.filter((e) => {
    const ts = new Date(e.ts).getTime();
    return Number.isFinite(ts) && ts >= fromMs && ts <= toMs;
  });
}

export function buildAccountingExportRows(
  entries: PaymentWormEntry[],
  map: Awaited<ReturnType<typeof loadAccountingMap>> = {}
): AccountingExportRow[] {
  const rows: AccountingExportRow[] = [];
  for (const entry of entries) {
    if (!entryHasMonetaryAmount(entry)) continue;
    const accounting = resolveEntryAccounting(entry);
    const usd = entry.payload.amount_usd;
    const usdc = entry.payload.amount_usdc;
    const pushRow = (amount: number, currency: "USD" | "USDC") => {
      rows.push({
        date: entry.ts,
        eventKind: entry.action,
        category: accounting.category,
        direction: accounting.direction,
        taxTreatment: accounting.taxTreatment ?? "unknown",
        amount,
        currency,
        tenantId: entry.payload.tenant_id,
        counterpartyId: accounting.counterpartyId ?? "",
        counterpartyKind: accounting.counterpartyKind ?? "",
        correlationId: entry.correlationId ?? "",
        provider: entry.payload.provider,
        resource: entry.payload.resource ?? "",
        glCode: resolveGlCode(accounting.category, map),
        summary: entry.summary,
      });
    };
    if (typeof usd === "number" && Number.isFinite(usd) && usd !== 0) {
      pushRow(usd, "USD");
    }
    if (typeof usdc === "number" && Number.isFinite(usdc) && usdc !== 0) {
      pushRow(usdc, "USDC");
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_COLUMNS: (keyof AccountingExportRow)[] = [
  "date",
  "eventKind",
  "category",
  "direction",
  "taxTreatment",
  "amount",
  "currency",
  "tenantId",
  "counterpartyId",
  "counterpartyKind",
  "correlationId",
  "provider",
  "resource",
  "glCode",
  "summary",
];

export function formatAccountingCsv(rows: AccountingExportRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
  return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

/** QuickBooks-friendly bank-style CSV (Date, Description, Amount). */
export function formatQbCsv(rows: AccountingExportRow[]): string {
  const header = "Date,Description,Amount,Account,Currency,Memo";
  const lines = rows.map((row) => {
    const signed = row.direction === "outflow" ? -Math.abs(row.amount) : Math.abs(row.amount);
    const desc = `${row.eventKind} ${row.category}`.trim();
    return [
      csvEscape(row.date.slice(0, 10)),
      csvEscape(desc),
      csvEscape(signed.toFixed(2)),
      csvEscape(row.glCode),
      csvEscape(row.currency),
      csvEscape(row.correlationId || row.resource),
    ].join(",");
  });
  return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

/** Xero bank-style CSV. */
export function formatXeroCsv(rows: AccountingExportRow[]): string {
  const header = "Date,Amount,Payee,Description,Reference,AccountCode";
  const lines = rows.map((row) => {
    const signed = row.direction === "outflow" ? -Math.abs(row.amount) : Math.abs(row.amount);
    return [
      csvEscape(row.date.slice(0, 10)),
      csvEscape(signed.toFixed(2)),
      csvEscape(row.counterpartyId || row.tenantId),
      csvEscape(`${row.eventKind} ${row.summary}`.slice(0, 200)),
      csvEscape(row.correlationId || row.resource),
      csvEscape(row.glCode),
    ].join(",");
  });
  return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

export function serializeAccountingExport(
  result: AccountingExportResult,
  format: AccountingExportFormat
): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === "qb-csv") return formatQbCsv(result.rows);
  if (format === "xero-csv") return formatXeroCsv(result.rows);
  return formatAccountingCsv(result.rows);
}

export type BuildAccountingExportOptions = {
  from: string;
  to: string;
  format?: AccountingExportFormat;
  skipVerify?: boolean;
  limit?: number;
  env?: NodeJS.ProcessEnv;
};

export async function buildAccountingExport(
  options: BuildAccountingExportOptions
): Promise<AccountingExportResult> {
  const env = options.env ?? process.env;
  const format = options.format ?? "csv";
  let verifyOk = true;
  if (!options.skipVerify) {
    const verify = await verifyPaymentAuditLog(env);
    if (!verify.ok) {
      const detail = verify.issues
        .slice(0, 5)
        .map((i) => `seq ${i.seq}: ${i.reason}`)
        .join("; ");
      throw new Error(
        `Payment audit chain failed — refuse accounting export (${verify.issues.length} issue(s))${detail ? `: ${detail}` : ""}`
      );
    }
    verifyOk = verify.ok;
  }

  const map = await loadAccountingMap(env);
  const entries = filterEntriesByPeriod(
    await listPaymentAuditEntries(options.limit ?? 100_000, env),
    options.from,
    options.to
  );
  const rows = buildAccountingExportRows(entries, map);
  return {
    from: options.from,
    to: options.to,
    format,
    rowCount: rows.length,
    totalUsd: rows.filter((r) => r.currency === "USD").reduce((s, r) => s + r.amount, 0),
    totalUsdc: rows.filter((r) => r.currency === "USDC").reduce((s, r) => s + r.amount, 0),
    rows,
    verifyOk,
  };
}

export async function writeAccountingExport(
  result: AccountingExportResult,
  outputPath: string
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeAccountingExport(result, result.format), "utf8");
}
