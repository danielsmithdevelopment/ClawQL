/**
 * Shared webhook / internal-run token check (audit 2.11).
 * Always require a configured token unless CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED=1.
 */

import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

function envFlagOn(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function timingSafeTokenEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type WebhookTokenResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * @param expectedEnvName — env var holding the shared secret
 * @param presented — bearer or custom header value from the request
 */
export function checkWebhookToken(args: {
  readonly expectedEnvName: string;
  readonly presented: string | undefined;
  readonly allowUnauthenticatedEnv?: string;
}): WebhookTokenResult {
  const allow =
    envFlagOn(args.allowUnauthenticatedEnv ?? "CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED");
  const expected = process.env[args.expectedEnvName]?.trim();
  if (!expected) {
    if (allow) return { ok: true };
    return {
      ok: false,
      status: 503,
      error: `Set ${args.expectedEnvName} (or ${args.allowUnauthenticatedEnv ?? "CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED"}=1 for local demos only).`,
    };
  }
  const presented = args.presented?.trim() ?? "";
  if (!presented || !timingSafeTokenEqual(presented, expected)) {
    return { ok: false, status: 401, error: "invalid or missing webhook token" };
  }
  return { ok: true };
}

export function bearerFromRequest(req: Request, altHeader?: string): string | undefined {
  const auth = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (auth) return auth;
  if (altHeader) {
    const alt = req.header(altHeader)?.trim();
    if (alt) return alt;
  }
  return undefined;
}
