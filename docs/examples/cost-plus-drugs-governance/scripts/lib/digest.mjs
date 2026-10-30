#!/usr/bin/env node
/**
 * Digest-bound mandate hashing — mirrors clawql-api pending/args-hash
 * (docs/specs/risk/execute-pause-resume-v0.1.md) so this offline demo
 * shows the same binding semantics without importing package internals.
 */
import { createHash } from "node:crypto";

function sortKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined) continue;
    out[key] = sortKeys(v);
  }
  return out;
}

export function canonicalizeForHash(value) {
  return JSON.stringify(sortKeys(value));
}

/**
 * @param {{ operationId: string, args: Record<string, unknown>, fields?: string[] | null }} payload
 */
export function hashPendingArgs(payload) {
  const body = canonicalizeForHash({
    operationId: payload.operationId,
    args: payload.args,
    fields: payload.fields ?? null,
  });
  return `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}
