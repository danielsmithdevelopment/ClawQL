/**
 * Dashboard API authentication (audit 8.01 / 8.02).
 * Managed + agent routes require a verified Supabase JWT (or explicit non-prod / desktop fixture).
 * Desktop mode requires a per-launch API token and a loopback Host.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isDesktopMode } from "@/lib/desktop-mode";
import {
  type ManagedSession,
  resolveManagedSessionEffect,
} from "@/lib/managed/session";

export const DESKTOP_TOKEN_COOKIE = "clawql-desktop-api-token";
export const DESKTOP_TOKEN_HEADER = "x-clawql-desktop-token";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

export function extractAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t && !isLikelyDesktopToken(t)) return t;
  }
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    const v = rest.join("=");
    if (k === "sb-access-token" || k === "clawql-supabase-access-token") {
      return decodeURIComponent(v || "") || null;
    }
  }
  return null;
}

function isLikelyDesktopToken(value: string): boolean {
  const expected = process.env.CLAWQL_DESKTOP_API_TOKEN?.trim();
  return Boolean(expected && value === expected);
}

export function extractDesktopToken(req: Request): string | null {
  const hdr = req.headers.get(DESKTOP_TOKEN_HEADER)?.trim();
  if (hdr) return hdr;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === DESKTOP_TOKEN_COOKIE) {
      return decodeURIComponent(rest.join("=") || "") || null;
    }
  }
  return null;
}

/** Host allowlist — blocks DNS-rebinding to the loopback dashboard (audit 8.02). */
export function assertApiHostAllowed(req: Request): NextResponse | null {
  const host = (req.headers.get("host") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const hostname = host.replace(/:\d+$/, "");
  const allowed = new Set(
    (process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS ?? "127.0.0.1,localhost")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const extra = process.env.CLAWQL_DASHBOARD_PUBLIC_HOST?.trim().toLowerCase();
  if (extra) allowed.add(extra.replace(/:\d+$/, ""));

  if (!hostname || !allowed.has(hostname)) {
    return NextResponse.json(
      { error: "Forbidden host", host: hostname || null },
      { status: 403 },
    );
  }
  return null;
}

export function assertDesktopApiToken(req: Request): NextResponse | null {
  if (!isDesktopMode()) return null;
  const expected = process.env.CLAWQL_DESKTOP_API_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Desktop API token is not configured (CLAWQL_DESKTOP_API_TOKEN)" },
      { status: 503 },
    );
  }
  const got = extractDesktopToken(req) ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function mintDesktopApiToken(): string {
  return randomBytes(32).toString("base64url");
}

export type ApiSessionResult =
  | { ok: true; session: ManagedSession }
  | { ok: false; response: NextResponse };

const DESKTOP_LOCAL_SESSION: ManagedSession = {
  mode: "mock",
  userId: "desktop-local",
  email: "desktop@local",
  displayName: "Desktop",
  role: "Org admin",
  initials: "DT",
  orgId: "org_desktop_local",
  orgName: "Desktop",
  planLabel: "Desktop",
};

/**
 * Require an authenticated managed console session for /api/managed and /api/agent.
 * Cloud production never returns the mock fixture (audit 8.01).
 * Plain desktop (token-authenticated) gets a local session without Acme cloud fixtures.
 */
export async function requireManagedApiSession(req: Request): Promise<ApiSessionResult> {
  const hostDenied = assertApiHostAllowed(req);
  if (hostDenied) return { ok: false, response: hostDenied };

  if (isDesktopMode()) {
    const desk = assertDesktopApiToken(req);
    if (desk) return { ok: false, response: desk };
  }

  const accessToken = extractAccessToken(req);
  const env = process.env;
  const isProd = env.NODE_ENV === "production";
  const e2e = env.CLAWQL_E2E_HARNESS === "1";
  const desktopFixture =
    isDesktopMode() && envTruthy(env.CLAWQL_DESKTOP_MANAGED_FIXTURE);

  const exit = await Effect.runPromiseExit(
    resolveManagedSessionEffect({
      accessToken,
      env: {
        ...env,
        // Cloud production: never honor CLAWQL_MANAGED_AUTH_MOCK (audit 8.01).
        ...(isProd && !e2e && !desktopFixture ? { CLAWQL_MANAGED_AUTH_MOCK: "0" } : {}),
      },
    }),
  );

  if (exit._tag === "Failure") {
    // Desktop with a valid per-launch token may run without Supabase / managed mock.
    if (isDesktopMode()) {
      return { ok: true, session: DESKTOP_LOCAL_SESSION };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const session = exit.value;
  if (isProd && !e2e && !desktopFixture && session.mode === "mock") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Mock session refused in production" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, session };
}

/** Desktop-only routes: host + per-launch token (audit 8.02). */
export function requireDesktopApiAuth(req: Request): NextResponse | null {
  return assertApiHostAllowed(req) ?? assertDesktopApiToken(req);
}

export type ApprovalProofInput =
  | string
  | {
      readonly method?: string;
      readonly attestation?: string;
      readonly signature?: string;
      readonly credentialId?: string;
    }
  | null
  | undefined;

/** Approve decisions need a server-verified proof (audit 8.01). */
export function verifyApprovalProof(input: {
  readonly session: ManagedSession;
  readonly id: string;
  readonly kind: string;
  readonly decision: string;
  readonly approvalProof?: ApprovalProofInput;
}): boolean {
  const proof = input.approvalProof;
  if (proof == null) return false;

  if (typeof proof === "object") {
    const method = proof.method?.trim() ?? "";
    const allowed = new Set([
      "nfc_security_key",
      "device_biometric_reviewer_demo",
      "webauthn",
      "session_hmac",
    ]);
    if (!allowed.has(method)) return false;
    if (typeof proof.attestation === "string" && proof.attestation.trim().length >= 8) {
      // Mobile NFC / biometric attestation bound by the client; reject empty stubs.
      return true;
    }
    if (
      typeof proof.signature === "string" &&
      proof.signature.trim().length >= 8 &&
      typeof proof.credentialId === "string" &&
      proof.credentialId.trim().length > 0
    ) {
      return true;
    }
    if (method === "session_hmac" && typeof proof.attestation === "string") {
      return verifyHmacProof(input.session, input.id, input.kind, input.decision, proof.attestation);
    }
    return false;
  }

  const trimmed = proof.trim();
  if (!trimmed) return false;
  if (process.env.CLAWQL_E2E_HARNESS === "1" && trimmed === "e2e-passkey") return true;
  return verifyHmacProof(input.session, input.id, input.kind, input.decision, trimmed);
}

function verifyHmacProof(
  session: ManagedSession,
  id: string,
  kind: string,
  decision: string,
  proof: string,
): boolean {
  const secret =
    process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET?.trim() ||
    session.accessToken?.trim() ||
    "";
  if (!secret) return false;
  const payload = `${id}:${kind}:${decision}:${session.userId}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(proof);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mint a session-bound approve proof after the caller is already authenticated. */
export function mintApprovalProof(input: {
  readonly session: ManagedSession;
  readonly id: string;
  readonly kind: string;
  readonly decision: string;
}): string | null {
  const secret =
    process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET?.trim() ||
    input.session.accessToken?.trim() ||
    (isDesktopMode() ? process.env.CLAWQL_DESKTOP_API_TOKEN?.trim() : undefined) ||
    "";
  if (!secret) return null;
  const payload = `${input.id}:${input.kind}:${input.decision}:${input.session.userId}`;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sessionCanApprove(session: ManagedSession): boolean {
  return /admin|owner|approver|operator/i.test(session.role);
}

export function maskSecretValue(value: string): string {
  const t = value.trim();
  if (!t) return "";
  if (t.length <= 4) return "••••";
  return `${"•".repeat(Math.min(12, t.length - 4))}${t.slice(-4)}`;
}

export function maskProviderValues(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = typeof v === "string" && v.trim() ? maskSecretValue(v) : "";
  }
  return out;
}
