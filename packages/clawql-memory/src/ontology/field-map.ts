/**
 * Bidirectional camelCase (API / filters) ↔ snake_case (CQE / SQL) mapping.
 * Spec: docs/specs/ontology/legal-domain-v0.1.md
 */

/** SQL result column (snake) → camel Matter field key. */
export const MATTER_SQL_TO_CAMEL: Readonly<Record<string, string>> = {
  id: "id",
  title: "title",
  status: "status",
  practice_area: "practiceArea",
  matter_type: "matterType",
  deal_value_usd: "dealValueUSD",
  escrow_pct: "escrowPct",
  escrow_duration_months: "escrowDurationMonths",
  non_compete_months: "nonCompeteMonths",
  non_compete_geography: "nonCompeteGeography",
  client_id: "clientId",
  vault_note_path: "vaultNotePath",
};

/**
 * Matter filter field (camelCase) → SQL column expression (`m.escrow_pct`).
 * `client` is accepted as an alias for `clientId`.
 */
export const MATTER_FILTER_COLUMNS: Readonly<Record<string, string>> = {
  id: "m.id",
  title: "m.title",
  status: "m.status",
  practiceArea: "m.practice_area",
  matterType: "m.matter_type",
  dealValueUSD: "m.deal_value_usd",
  escrowPct: "m.escrow_pct",
  escrowDurationMonths: "m.escrow_duration_months",
  nonCompeteMonths: "m.non_compete_months",
  nonCompeteGeography: "m.non_compete_geography",
  client: "m.client_id",
  clientId: "m.client_id",
};

export const CLIENT_FILTER_COLUMNS: Readonly<Record<string, string>> = {
  id: "c.id",
  name: "c.name",
  shortName: "c.short_name",
  industry: "c.industry",
  tier: "c.tier",
};

export const ATTORNEY_FILTER_COLUMNS: Readonly<Record<string, string>> = {
  id: "a.id",
  name: "a.name",
  title: "a.title",
};

export const DOCUMENT_FILTER_COLUMNS: Readonly<Record<string, string>> = {
  id: "d.id",
  title: "d.title",
  documentType: "d.document_type",
  matterId: "d.matter_id",
  status: "d.status",
};

export const LEGAL_SCHEMA_FILTER_COLUMNS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "legal.Matter": MATTER_FILTER_COLUMNS,
  "legal.Client": CLIENT_FILTER_COLUMNS,
  "legal.Attorney": ATTORNEY_FILTER_COLUMNS,
  "legal.Document": DOCUMENT_FILTER_COLUMNS,
};

/** camelCase → snake_case (`escrowPct` → `escrow_pct`). */
export function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * snake_case → camelCase (`escrow_pct` → `escrowPct`).
 * Known Matter SQL columns use the explicit map so acronyms stay correct
 * (`deal_value_usd` → `dealValueUSD`, not `dealValueUsd`).
 */
export function snakeToCamel(name: string): string {
  const known = MATTER_SQL_TO_CAMEL[name];
  if (known) return known;
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function matterFieldsFromSqlRow(row: Record<string, unknown>): {
  id: string;
  title?: string;
  status?: string;
  practiceArea?: string;
  matterType?: string;
  dealValueUSD?: number;
  escrowPct?: number;
  escrowDurationMonths?: number;
  nonCompeteMonths?: number;
  nonCompeteGeography?: string;
  clientId?: string;
  vaultNotePath: string;
} {
  const str = (k: string): string | undefined =>
    row[k] != null && row[k] !== "" ? String(row[k]) : undefined;
  const num = (k: string): number | undefined =>
    row[k] != null && row[k] !== "" ? Number(row[k]) : undefined;

  return {
    id: String(row.id),
    title: str("title"),
    status: str("status"),
    practiceArea: str("practice_area"),
    matterType: str("matter_type"),
    dealValueUSD: num("deal_value_usd"),
    escrowPct: num("escrow_pct"),
    escrowDurationMonths: num("escrow_duration_months"),
    nonCompeteMonths: num("non_compete_months"),
    nonCompeteGeography: str("non_compete_geography"),
    clientId: str("client_id"),
    vaultNotePath: String(row.vault_note_path ?? ""),
  };
}

export function clientFieldsFromSqlRow(row: Record<string, unknown>): {
  id: string;
  name: string;
  shortName?: string;
  industry?: string;
  tier?: string;
  vaultNotePath: string;
} {
  const str = (k: string): string | undefined =>
    row[k] != null && row[k] !== "" ? String(row[k]) : undefined;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    shortName: str("short_name"),
    industry: str("industry"),
    tier: str("tier"),
    vaultNotePath: String(row.vault_note_path ?? ""),
  };
}

export function attorneyFieldsFromSqlRow(row: Record<string, unknown>): {
  id: string;
  name: string;
  title?: string;
  vaultNotePath: string;
} {
  const str = (k: string): string | undefined =>
    row[k] != null && row[k] !== "" ? String(row[k]) : undefined;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    title: str("title"),
    vaultNotePath: String(row.vault_note_path ?? ""),
  };
}

export function documentFieldsFromSqlRow(row: Record<string, unknown>): {
  id: string;
  title: string;
  documentType?: string;
  matterId?: string;
  status?: string;
  vaultNotePath: string;
} {
  const str = (k: string): string | undefined =>
    row[k] != null && row[k] !== "" ? String(row[k]) : undefined;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    documentType: str("document_type"),
    matterId: str("matter_id"),
    status: str("status"),
    vaultNotePath: String(row.vault_note_path ?? ""),
  };
}
