/**
 * Canonical args hash for pending execute park/resume binding.
 */

import { createHash } from "node:crypto";
import { Effect } from "effect";

/** Stable JSON: sorted object keys, arrays in order, undefined omitted. */
export function canonicalizeForHash(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    out[key] = sortKeys(v);
  }
  return out;
}

export type PendingArgsPayload = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
};

export const hashPendingArgsEffect = (payload: PendingArgsPayload): Effect.Effect<string> =>
  Effect.sync(() => {
    const body = canonicalizeForHash({
      operationId: payload.operationId,
      args: payload.args,
      fields: payload.fields ?? null,
    });
    const digest = createHash("sha256").update(body, "utf8").digest("hex");
    return `sha256:${digest}`;
  });

export function hashPendingArgs(payload: PendingArgsPayload): string {
  return Effect.runSync(hashPendingArgsEffect(payload));
}
