/**
 * Email identity normalization for ClawQL-owned keys (not IdP login).
 * Opt-in plus-tag strip: CLAWQL_EMAIL_PLUS_NORMALIZE=1
 */
import { Context, Effect, Layer } from "effect";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NormalizeEmailIdentityOptions = {
  /** Strip `+tag` from the local part. Default: env CLAWQL_EMAIL_PLUS_NORMALIZE. */
  readonly stripPlus?: boolean;
  readonly env?: NodeJS.ProcessEnv;
};

function envPlusNormalizeEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.CLAWQL_EMAIL_PLUS_NORMALIZE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Trim + lowercase; optionally strip +tag before @. Throws on empty/invalid. */
export function normalizeEmailIdentity(
  raw: string,
  options: NormalizeEmailIdentityOptions = {}
): string {
  const env = options.env ?? process.env;
  const stripPlus = options.stripPlus ?? envPlusNormalizeEnabled(env);
  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) throw new Error("Email required");
  if (stripPlus) {
    const at = cleaned.lastIndexOf("@");
    if (at > 0) {
      const local = cleaned.slice(0, at);
      const domain = cleaned.slice(at + 1);
      const plus = local.indexOf("+");
      cleaned = `${plus >= 0 ? local.slice(0, plus) : local}@${domain}`;
    }
  }
  if (!EMAIL_RE.test(cleaned)) {
    throw new Error(`Invalid email "${raw}"`);
  }
  return cleaned;
}

export const normalizeEmailIdentityEffect = (
  raw: string,
  options: NormalizeEmailIdentityOptions = {}
): Effect.Effect<string, Error> =>
  Effect.try({
    try: () => normalizeEmailIdentity(raw, options),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export const CLAWQL_EMAIL_NORMALIZE_TAG = "clawql/EmailNormalize" as const;

export class EmailNormalizeService extends Context.Service<
  typeof CLAWQL_EMAIL_NORMALIZE_TAG,
  {
    readonly normalizeIdentity: (
      raw: string,
      options?: NormalizeEmailIdentityOptions
    ) => Effect.Effect<string, Error>;
  }
>()(CLAWQL_EMAIL_NORMALIZE_TAG) {}

export const EmailNormalizeLive = Layer.succeed(EmailNormalizeService, {
  normalizeIdentity: normalizeEmailIdentityEffect,
});
