/**
 * Normalize Langfuse (or compatible) score / trace webhook payloads ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)).
 */

export type NormalizedLangfuseEval = {
  scoreName: string;
  scoreValue: number;
  traceId?: string;
  seedId?: string;
  correlationId?: string;
  comment?: string;
  metadata: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function readMetadata(...sources: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const src of sources) {
    const row = asRecord(src);
    if (!row) continue;
    for (const [k, v] of Object.entries(row)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

function readNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && c.trim() !== "") {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function readString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Parse common Langfuse webhook / export shapes into a normalized eval event.
 * Returns null when no numeric score is present.
 */
export function normalizeLangfuseEvalPayload(body: unknown): NormalizedLangfuseEval | null {
  const root = asRecord(body);
  if (!root) return null;

  const scoreObj = asRecord(root.score) ?? asRecord(root.data) ?? root;
  const traceObj = asRecord(root.trace) ?? asRecord(scoreObj.trace) ?? asRecord(root.observation);

  const metadata = readMetadata(
    root.metadata,
    scoreObj.metadata,
    traceObj?.metadata,
    root.input,
    traceObj?.input
  );

  const scoreValue = readNumber(
    scoreObj.value,
    scoreObj.score,
    root.value,
    root.scoreValue,
    root.score_value
  );
  if (scoreValue === undefined) return null;

  const scoreName =
    readString(scoreObj.name, root.scoreName, root.score_name, root.metric, root.name) ??
    "langfuse_score";

  const traceId = readString(
    root.traceId,
    root.trace_id,
    traceObj?.id,
    scoreObj.traceId,
    scoreObj.trace_id
  );

  const seedId = readString(
    metadata.seed_id,
    metadata.clawql_seed_id,
    metadata.ouroboros_seed_id,
    root.seed_id,
    root.seedId
  );

  const correlationId = readString(
    metadata.correlation_id,
    metadata.correlationId,
    root.correlation_id,
    root.correlationId
  );

  const comment = readString(scoreObj.comment, root.comment, metadata.comment);

  return {
    scoreName,
    scoreValue,
    traceId,
    seedId,
    correlationId,
    comment,
    metadata,
  };
}
