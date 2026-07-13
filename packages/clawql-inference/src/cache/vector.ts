const DEFAULT_EMBEDDING_DIMENSION = 1536;

export function inferenceEmbeddingDimension(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_EMBEDDING_DIMENSION?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EMBEDDING_DIMENSION;
}

export function toVectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(",")}]`;
}

export function parseVectorText(value: string): Float32Array {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return new Float32Array(0);
  }
  const inner = trimmed.slice(1, -1);
  if (!inner.length) return new Float32Array(0);
  const parts = inner.split(",");
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    out[i] = Number.parseFloat(parts[i]!.trim());
  }
  return out;
}
