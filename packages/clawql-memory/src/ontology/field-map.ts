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
