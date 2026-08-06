/**
 * HATEOAS deep links for prepaid P2P (pay / request / invite).
 * Base matches compensation approval URLs so HTMX/gateway can host GET-safe views.
 *
 * Effect-first: URL builders + envelope are `Effect` (primary API). `CreditsDeeplinkService`
 * exposes the env-reading builders behind a `Context.Tag`; pure parse/format helpers are
 * `Effect.sync` exports.
 */

import { Context, Effect, Layer } from "effect";
import { compensationApprovalBaseUrl } from "../compensation/config.js";

export const creditsHateoasBase = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(() =>
    (env.CLAWQL_CREDITS_HATEOAS_BASE?.trim() || compensationApprovalBaseUrl(env)).replace(/\/$/, "")
  );

/** True when the configured HATEOAS base is an http(s) origin (mountable HTML). */
export const isHttpCreditsHateoasBase = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.map(creditsHateoasBase(env), (base) => /^https?:\/\//i.test(base));

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
export const buildCreditsTransferApproveUrl = (
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(
    creditsHateoasBase(env),
    (base) => `${base}/credits/transfer/approve?${transferActionQuery(actionId, code)}`
  );

/** POST target for confirming a staged transfer (not GET-safe). */
export const buildCreditsTransferConfirmUrl = (
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(
    creditsHateoasBase(env),
    (base) => `${base}/credits/transfer/confirm?${transferActionQuery(actionId, code)}`
  );

/** GET-safe cancel for a staged transfer. */
export const buildCreditsTransferCancelUrl = (
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(
    creditsHateoasBase(env),
    (base) => `${base}/credits/transfer/cancel?${transferActionQuery(actionId, code)}`
  );

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

function payQuery(input: PayDeepLink): URLSearchParams {
  const q = new URLSearchParams();
  q.set("to", input.to.trim());
  if (input.amountUsd !== undefined && Number.isFinite(input.amountUsd)) {
    q.set("amount", String(input.amountUsd));
  }
  if (input.note?.trim()) q.set("note", input.note.trim());
  if (input.fromTenantId?.trim()) q.set("from", input.fromTenantId.trim());
  return q;
}

export const buildPayDeepLink = (
  input: PayDeepLink,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(creditsHateoasBase(env), (base) => `${base}/credits/pay?${payQuery(input).toString()}`);

export const buildRequestDeepLink = (
  input: RequestDeepLink,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(
    creditsHateoasBase(env),
    (base) => `${base}/credits/request/${encodeURIComponent(input.requestId.trim())}`
  );

export const buildInviteDeepLink = (
  input: InviteDeepLink,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(creditsHateoasBase(env), (base) => {
    const q = new URLSearchParams({
      request_id: input.requestId.trim(),
      token: input.token.trim(),
    });
    return `${base}/credits/request/invite?${q.toString()}`;
  });

/** clawql:// convenience alias (always scheme-based, ignores HTTP base). */
export const buildClawqlPayUri = (input: PayDeepLink): Effect.Effect<string> =>
  Effect.sync(() => `clawql://pay?${payQuery(input).toString()}`);

/** Payload preferred for QR codes — scheme URI so scanners work without an HTTP host. */
export const buildPayQrPayload = (input: PayDeepLink): Effect.Effect<string> =>
  buildClawqlPayUri(input);

function parsePayDeepLinkQuerySync(
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

export const parsePayDeepLinkQuery = (
  query: Record<string, string | string[] | undefined>
): Effect.Effect<PayDeepLink, Error> => Effect.try(() => parsePayDeepLinkQuerySync(query));

/**
 * Parse `clawql://pay?…`, absolute HATEOAS pay URLs, or bare query strings.
 */
export const parseCreditsDeepLink = (
  raw: string
): Effect.Effect<({ ok: true } & PayDeepLink) | { ok: false; error: string }> =>
  Effect.sync(() => {
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
      return { ok: true, ...parsePayDeepLinkQuerySync(query) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9@._+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const payCliHint = (input: PayDeepLink): Effect.Effect<string> =>
  Effect.sync(() => {
    const parts = ["clawql payments credits pay", `--to ${shellQuote(input.to)}`];
    if (input.amountUsd !== undefined) parts.push(`--amount ${input.amountUsd}`);
    if (input.note) parts.push(`--note ${shellQuote(input.note)}`);
    if (input.fromTenantId) parts.push(`--from-tenant ${shellQuote(input.fromTenantId)}`);
    return parts.join(" ");
  });

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

export const payHateoasEnvelope = (
  input: PayDeepLink,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<HateoasEnvelope> =>
  Effect.gen(function* () {
    const base = yield* creditsHateoasBase(env);
    const self = yield* buildPayDeepLink(input, env);
    const clawql = yield* buildClawqlPayUri(input);
    const cli = yield* payCliHint(input);
    return {
      ok: true,
      kind: "credits.pay",
      summary: `Pay ${input.amountUsd != null ? `$${input.amountUsd}` : "credits"} to ${input.to}`,
      data: { ...input },
      links: {
        self,
        clawql,
        cli,
        qr: `${base}/credits/qr.svg?${new URLSearchParams({
          to: input.to,
          ...(input.amountUsd != null ? { amount: String(input.amountUsd) } : {}),
          ...(input.note ? { note: input.note } : {}),
        }).toString()}`,
        approval_url: self,
      },
      approval_url: self,
    };
  });

/** Effect surface over the env-reading credits deep-link builders. */
export class CreditsDeeplinkService extends Context.Tag("clawql/CreditsDeeplinkService")<
  CreditsDeeplinkService,
  {
    readonly creditsHateoasBase: Effect.Effect<string>;
    readonly isHttpCreditsHateoasBase: Effect.Effect<boolean>;
    readonly buildCreditsTransferApproveUrl: (
      actionId: string,
      code: string
    ) => Effect.Effect<string>;
    readonly buildCreditsTransferConfirmUrl: (
      actionId: string,
      code: string
    ) => Effect.Effect<string>;
    readonly buildCreditsTransferCancelUrl: (
      actionId: string,
      code: string
    ) => Effect.Effect<string>;
    readonly buildPayDeepLink: (input: PayDeepLink) => Effect.Effect<string>;
    readonly buildRequestDeepLink: (input: RequestDeepLink) => Effect.Effect<string>;
    readonly buildInviteDeepLink: (input: InviteDeepLink) => Effect.Effect<string>;
    readonly payHateoasEnvelope: (input: PayDeepLink) => Effect.Effect<HateoasEnvelope>;
  }
>() {}

/** Live deep-link builders bound to a specific environment snapshot. */
export const creditsDeeplinkLiveLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsDeeplinkService> =>
  Layer.succeed(
    CreditsDeeplinkService,
    CreditsDeeplinkService.of({
      creditsHateoasBase: creditsHateoasBase(env),
      isHttpCreditsHateoasBase: isHttpCreditsHateoasBase(env),
      buildCreditsTransferApproveUrl: (actionId, code) =>
        buildCreditsTransferApproveUrl(actionId, code, env),
      buildCreditsTransferConfirmUrl: (actionId, code) =>
        buildCreditsTransferConfirmUrl(actionId, code, env),
      buildCreditsTransferCancelUrl: (actionId, code) =>
        buildCreditsTransferCancelUrl(actionId, code, env),
      buildPayDeepLink: (input) => buildPayDeepLink(input, env),
      buildRequestDeepLink: (input) => buildRequestDeepLink(input, env),
      buildInviteDeepLink: (input) => buildInviteDeepLink(input, env),
      payHateoasEnvelope: (input) => payHateoasEnvelope(input, env),
    })
  );
