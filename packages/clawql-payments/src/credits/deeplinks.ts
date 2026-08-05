/**
 * HATEOAS deep links for prepaid P2P (pay / request / invite).
 * Base matches compensation approval URLs so HTMX/gateway can host GET-safe views.
 */

import { compensationApprovalBaseUrl } from "../compensation/config.js";

export function creditsHateoasBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CLAWQL_CREDITS_HATEOAS_BASE?.trim() || compensationApprovalBaseUrl(env)).replace(
    /\/$/,
    ""
  );
}

/** True when the configured HATEOAS base is an http(s) origin (mountable HTML). */
export function isHttpCreditsHateoasBase(env: NodeJS.ProcessEnv = process.env): boolean {
  const base = creditsHateoasBase(env);
  return /^https?:\/\//i.test(base);
}

function transferActionQuery(actionId: string, code: string): string {
  return new URLSearchParams({
    action_id: actionId.trim(),
    code: code.trim(),
  }).toString();
}

/**
 * Magic-link approve view (GET-safe). Possession of action_id + code is the
 * capability; confirm still requires an explicit POST (and TOTP when gated).
 */
export function buildCreditsTransferApproveUrl(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${creditsHateoasBase(env)}/credits/transfer/approve?${transferActionQuery(actionId, code)}`;
}

/** POST target for confirming a staged transfer (not GET-safe). */
export function buildCreditsTransferConfirmUrl(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${creditsHateoasBase(env)}/credits/transfer/confirm?${transferActionQuery(actionId, code)}`;
}

/** GET-safe cancel for a staged transfer. */
export function buildCreditsTransferCancelUrl(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${creditsHateoasBase(env)}/credits/transfer/cancel?${transferActionQuery(actionId, code)}`;
}

export type PayDeepLink = {
  to: string;
  amountUsd?: number;
  note?: string;
  fromTenantId?: string;
};

export type RequestDeepLink = {
  requestId: string;
};

export type InviteDeepLink = {
  requestId: string;
  token: string;
};

export function buildPayDeepLink(input: PayDeepLink, env: NodeJS.ProcessEnv = process.env): string {
  const base = creditsHateoasBase(env);
  const q = new URLSearchParams();
  q.set("to", input.to.trim());
  if (input.amountUsd !== undefined && Number.isFinite(input.amountUsd)) {
    q.set("amount", String(input.amountUsd));
  }
  if (input.note?.trim()) q.set("note", input.note.trim());
  if (input.fromTenantId?.trim()) q.set("from", input.fromTenantId.trim());
  return `${base}/credits/pay?${q.toString()}`;
}

export function buildRequestDeepLink(
  input: RequestDeepLink,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = creditsHateoasBase(env);
  return `${base}/credits/request/${encodeURIComponent(input.requestId.trim())}`;
}

export function buildInviteDeepLink(
  input: InviteDeepLink,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = creditsHateoasBase(env);
  const q = new URLSearchParams({
    request_id: input.requestId.trim(),
    token: input.token.trim(),
  });
  return `${base}/credits/request/invite?${q.toString()}`;
}

/** clawql:// convenience alias (always scheme-based, ignores HTTP base). */
export function buildClawqlPayUri(input: PayDeepLink): string {
  const q = new URLSearchParams();
  q.set("to", input.to.trim());
  if (input.amountUsd !== undefined && Number.isFinite(input.amountUsd)) {
    q.set("amount", String(input.amountUsd));
  }
  if (input.note?.trim()) q.set("note", input.note.trim());
  if (input.fromTenantId?.trim()) q.set("from", input.fromTenantId.trim());
  return `clawql://pay?${q.toString()}`;
}

/** Payload preferred for QR codes — scheme URI so scanners work without an HTTP host. */
export function buildPayQrPayload(input: PayDeepLink): string {
  return buildClawqlPayUri(input);
}

export function parsePayDeepLinkQuery(
  query: Record<string, string | string[] | undefined>
): PayDeepLink {
  const get = (k: string) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const to = get("to")?.trim();
  if (!to) throw new Error("Missing to= payee");
  const amountRaw = get("amount");
  const amountUsd = amountRaw && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : undefined;
  return {
    to,
    amountUsd,
    note: get("note")?.trim() || undefined,
    fromTenantId: get("from")?.trim() || undefined,
  };
}

/**
 * Parse `clawql://pay?…`, absolute HATEOAS pay URLs, or bare query strings.
 */
export function parseCreditsDeepLink(
  raw: string
): ({ ok: true } & PayDeepLink) | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Empty deep link" };
  try {
    let query: Record<string, string | string[] | undefined>;
    if (trimmed.startsWith("clawql://pay")) {
      const u = new URL(trimmed.replace(/^clawql:/, "http:"));
      query = Object.fromEntries(u.searchParams.entries());
    } else if (trimmed.includes("://") || trimmed.startsWith("/")) {
      const u = new URL(trimmed, "http://local.invalid");
      if (!u.pathname.includes("/credits/pay")) {
        return { ok: false, error: "Not a credits pay deep link" };
      }
      query = Object.fromEntries(u.searchParams.entries());
    } else if (trimmed.includes("=")) {
      query = Object.fromEntries(new URLSearchParams(trimmed).entries());
    } else {
      return { ok: false, error: "Unrecognized deep link format" };
    }
    return { ok: true, ...parsePayDeepLinkQuery(query) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function payCliHint(input: PayDeepLink): string {
  const parts = ["clawql payments credits pay", `--to ${shellQuote(input.to)}`];
  if (input.amountUsd !== undefined) parts.push(`--amount ${input.amountUsd}`);
  if (input.note) parts.push(`--note ${shellQuote(input.note)}`);
  if (input.fromTenantId) parts.push(`--from-tenant ${shellQuote(input.fromTenantId)}`);
  return parts.join(" ");
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9@._+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export type HateoasLinkMap = {
  self: string;
  cli?: string;
  qr?: string;
  invite?: string;
  accept?: string;
  decline?: string;
  claim?: string;
  clawql?: string;
  /** Next step (DAOS-style approval_url thread). */
  approval_url?: string | null;
};

export type HateoasEnvelope = {
  ok: boolean;
  kind: string;
  summary: string;
  data: Record<string, unknown>;
  links: HateoasLinkMap;
  approval_url: string | null;
};

export function payHateoasEnvelope(
  input: PayDeepLink,
  env: NodeJS.ProcessEnv = process.env
): HateoasEnvelope {
  const self = buildPayDeepLink(input, env);
  const clawql = buildClawqlPayUri(input);
  const cli = payCliHint(input);
  return {
    ok: true,
    kind: "credits.pay",
    summary: `Pay ${input.amountUsd != null ? `$${input.amountUsd}` : "credits"} to ${input.to}`,
    data: { ...input },
    links: {
      self,
      clawql,
      cli,
      qr: `${creditsHateoasBase(env)}/credits/qr.svg?${new URLSearchParams({
        to: input.to,
        ...(input.amountUsd != null ? { amount: String(input.amountUsd) } : {}),
        ...(input.note ? { note: input.note } : {}),
      }).toString()}`,
      approval_url: self,
    },
    approval_url: self,
  };
}
