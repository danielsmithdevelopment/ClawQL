/** Resolve Langfuse OTLP ingest URL and auth headers (ADR 0005). */
export function resolveLangfuseOtlpConfig(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  headers: Record<string, string>;
} | null {
  const host = env.LANGFUSE_HOST?.trim() || env.LANGFUSE_BASE_URL?.trim();
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!host || !publicKey || !secretKey) return null;

  const base = host.replace(/\/$/, "");
  const auth = Buffer.from(`${publicKey}:${secretKey}`, "utf8").toString("base64");
  return {
    url: `${base}/api/public/otel/v1/traces`,
    headers: {
      Authorization: `Basic ${auth}`,
      "x-langfuse-public-key": publicKey,
      "x-langfuse-secret-key": secretKey,
    },
  };
}
