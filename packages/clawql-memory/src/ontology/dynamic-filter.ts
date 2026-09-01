/**
 * In-process predicate matching for dynamic_records.fields_json.
 */
import type { FilterPredicate, OntologyFilter } from "./ontology-query.js";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function matchDynamicPredicate(value: unknown, predicate: FilterPredicate): boolean {
  if ("eq" in predicate) return value === predicate.eq;
  if ("ne" in predicate) return value !== predicate.ne;
  if ("gte" in predicate) {
    const n = asNumber(value);
    return n !== null && n >= Number(predicate.gte);
  }
  if ("gt" in predicate) {
    const n = asNumber(value);
    return n !== null && n > Number(predicate.gt);
  }
  if ("lte" in predicate) {
    const n = asNumber(value);
    return n !== null && n <= Number(predicate.lte);
  }
  if ("lt" in predicate) {
    const n = asNumber(value);
    return n !== null && n < Number(predicate.lt);
  }
  if (
    "between" in predicate &&
    Array.isArray(predicate.between) &&
    predicate.between.length === 2
  ) {
    const n = asNumber(value);
    return n !== null && n >= Number(predicate.between[0]) && n <= Number(predicate.between[1]);
  }
  if ("in" in predicate && Array.isArray(predicate.in)) {
    return predicate.in.includes(value as never);
  }
  if ("nin" in predicate && Array.isArray(predicate.nin)) {
    return !predicate.nin.includes(value as never);
  }
  if ("contains" in predicate) {
    return String(value ?? "")
      .toLowerCase()
      .includes(String(predicate.contains).toLowerCase());
  }
  if ("startsWith" in predicate) {
    return String(value ?? "")
      .toLowerCase()
      .startsWith(String(predicate.startsWith).toLowerCase());
  }
  if ("isNull" in predicate) {
    const isNull =
      value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    return predicate.isNull ? isNull : !isNull;
  }
  return false;
}

export function matchDynamicFilters(
  fields: Record<string, unknown>,
  filters: OntologyFilter
): boolean {
  for (const [field, predicate] of Object.entries(filters)) {
    if (!predicate || typeof predicate !== "object") return false;
    if (!matchDynamicPredicate(fields[field], predicate)) return false;
  }
  return true;
}
