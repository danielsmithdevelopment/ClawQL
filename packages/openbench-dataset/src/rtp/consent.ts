import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_SCOPES = ["community_model", "dataset_licensing"] as const;
const DEFAULT_ISSUER = "clawql-openbench-gateway";

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function resolveConsentSecret(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    env.CLAWQL_RTP_CONSENT_SECRET?.trim() ||
    env.CLAWQL_OPENBENCH_CONSENT_SECRET?.trim();
  if (explicit) return explicit;
  // CI / own-infra fallback: deterministic material so job-start consent is
  // reproducible for the run without a separate gateway. Prefer setting an
  // explicit secret for production dataset licensing.
  const run = env.GITHUB_RUN_ID || env.CLAWQL_OPENBENCH_RUN_ID || "local";
  const sha = env.GITHUB_SHA || env.CLAWQL_VERSION || "dev";
  return `clawql-openbench-consent-dev:${run}:${sha}`;
}

export type IssueConsentOptions = {
  runId: string;
  taskId: string;
  issuedAt?: string;
  expiresInSec?: number;
  scopes?: string[];
  issuer?: string;
  env?: NodeJS.ProcessEnv;
  /** Pre-issued token (e.g. from gateway at job start). */
  preissuedToken?: string;
};

export type IssuedConsent = {
  token: string;
  scopes: string[];
  issuedAt: string;
  issuer: string;
  subject: string;
};

/**
 * Mint (or accept) an RTP §6.2-style HS256 JWT for OpenBench collection.
 * Scopes: community_model + dataset_licensing close the consent provenance loop.
 */
export function issueOpenBenchConsentToken(opts: IssueConsentOptions): IssuedConsent {
  const issuedAt = opts.issuedAt ?? new Date().toISOString();
  const scopes = opts.scopes ?? [...DEFAULT_SCOPES];
  const issuer = opts.issuer ?? DEFAULT_ISSUER;
  const subject = `openbench:run:${opts.runId}:task:${opts.taskId}`;

  if (opts.preissuedToken?.trim()) {
    return {
      token: opts.preissuedToken.trim(),
      scopes,
      issuedAt,
      issuer,
      subject,
    };
  }

  const env = opts.env ?? process.env;
  if (env.CLAWQL_OPENBENCH_CONSENT_TOKEN?.trim()) {
    return {
      token: env.CLAWQL_OPENBENCH_CONSENT_TOKEN.trim(),
      scopes,
      issuedAt,
      issuer,
      subject,
    };
  }

  const iat = Math.floor(new Date(issuedAt).getTime() / 1000);
  const exp = iat + (opts.expiresInSec ?? 60 * 60 * 24 * 90);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: issuer,
    sub: subject,
    scope: scopes.join(" "),
    iat,
    exp,
    run_id: opts.runId,
    task_id: opts.taskId,
    purpose: "openbench_trace_dataset",
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", resolveConsentSecret(env))
    .update(signingInput)
    .digest();
  const token = `${signingInput}.${b64url(sig)}`;
  return { token, scopes, issuedAt, issuer, subject };
}

/** Verify a token minted by {@link issueOpenBenchConsentToken} with the same secret. */
export function verifyOpenBenchConsentToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;
  const expected = createHmac("sha256", resolveConsentSecret(env))
    .update(signingInput)
    .digest();
  let actual: Buffer;
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    actual = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
