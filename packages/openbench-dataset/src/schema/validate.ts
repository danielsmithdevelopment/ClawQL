import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenBenchTraceV1 } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve shipped JSON Schema (package root `schema/` or monorepo copy). */
export function openBenchTraceSchemaPath(): string {
  const candidates = [
    join(HERE, "../../schema/openbench-trace.v1.json"),
    join(HERE, "../../../schema/openbench-trace.v1.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("openbench-trace.v1.json not found next to openbench-dataset package");
}

export function loadOpenBenchTraceSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(openBenchTraceSchemaPath(), "utf8")) as Record<string, unknown>;
}

/** Lightweight required-field check (full ajv optional at call sites). */
export function assertOpenBenchTraceShape(trace: OpenBenchTraceV1): void {
  if (trace.schema_version !== "1.0" && trace.schema_version !== "1.1") {
    throw new Error(`unsupported schema_version: ${trace.schema_version}`);
  }
  if (trace.verdict_source !== "grader") {
    throw new Error("verdict_source must be grader");
  }
  if (trace.arm !== "on" && trace.arm !== "off") {
    throw new Error(`invalid arm: ${trace.arm}`);
  }
  if (!["pass", "fail", "partial"].includes(trace.verdict)) {
    throw new Error(`invalid verdict: ${trace.verdict}`);
  }
  if (typeof trace.score !== "number" || trace.score < 0 || trace.score > 1) {
    throw new Error(`score out of range: ${trace.score}`);
  }
  if (trace.schema_version === "1.1") {
    if (!trace.rtp || trace.rtp.protocol !== "rtp") {
      throw new Error("schema_version 1.1 requires rtp.protocol === \"rtp\"");
    }
    if (!Array.isArray(trace.rtp.turnSequence) || trace.rtp.turnSequence.length < 2) {
      throw new Error("rtp.turnSequence must include at least Intent + Verdict");
    }
    const kinds = trace.rtp.turnSequence.map((t) => t.kind);
    if (kinds[0] !== "intent" || kinds[kinds.length - 1] !== "verdict") {
      throw new Error("rtp.turnSequence must start with intent and end with verdict");
    }
    if (!trace.rtp.consentToken?.token || !trace.rtp.consentToken.scopes?.length) {
      throw new Error("rtp.consentToken with scopes is required");
    }
    const tier = trace.rtp.verdict?.evaluatorTier;
    if (tier !== 1 && tier !== 2 && tier !== 3) {
      throw new Error(`invalid rtp.verdict.evaluatorTier: ${tier}`);
    }
  }
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
