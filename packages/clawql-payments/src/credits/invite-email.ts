/**
 * Outbound email for money-request invites.
 *
 * Default is dry-run (preview only) — print/share the invite URL remains enough.
 * Real delivery is opt-in via CLAWQL_CREDITS_INVITE_EMAIL=1 and a provider.
 * Invite tokens / emails are never written to payment WORM.
 */

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "0" || n === "false" || n === "no" || n === "off";
}

export type InviteEmailProvider = "dry-run" | "webhook" | "resend";

/** Master enable for auto-send / send-invite (still dry-runs unless provider is live). */
export function isCreditsInviteEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_CREDITS_INVITE_EMAIL);
}

/**
 * Dry-run unless explicitly disabled.
 * Even with CLAWQL_CREDITS_INVITE_EMAIL=1, keep dry-run until CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN=0.
 */
export function isCreditsInviteEmailDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN)) return false;
  if (parseTruthy(env.CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN)) return true;
  // Default: dry-run on (safe).
  return true;
}

export function creditsInviteEmailProvider(
  env: NodeJS.ProcessEnv = process.env
): InviteEmailProvider {
  if (isCreditsInviteEmailDryRun(env)) return "dry-run";
  const raw = (env.CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "webhook" || raw === "resend" || raw === "dry-run") return raw;
  if (env.CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY?.trim()) return "resend";
  if (env.CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL?.trim()) return "webhook";
  return "dry-run";
}

export function creditsInviteEmailFrom(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.CLAWQL_CREDITS_INVITE_EMAIL_FROM?.trim() ||
    "ClawQL Payments <noreply@clawql.local>"
  );
}

export type MoneyRequestInviteEmailInput = {
  toEmail: string;
  inviteUrl: string;
  requestId: string;
  amountCents: number;
  note?: string;
  fromLabel?: string;
  /** Cleartext invite token — only for email body / claim CLI hint; never persist. */
  inviteToken?: string;
  expiresAt?: string;
};

export type InviteEmailPayload = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  meta: {
    requestId: string;
    inviteUrl: string;
    amountUsd: number;
    provider: InviteEmailProvider;
    dryRun: boolean;
  };
};

export type InviteEmailResult = {
  ok: boolean;
  provider: InviteEmailProvider;
  dryRun: boolean;
  to: string;
  subject: string;
  /** Preview of text body (always returned for CLI/MCP). */
  previewText: string;
  messageId?: string;
  error?: string;
};

export function buildMoneyRequestInviteEmail(
  input: MoneyRequestInviteEmailInput,
  env: NodeJS.ProcessEnv = process.env
): InviteEmailPayload {
  const amountUsd = input.amountCents / 100;
  const fromLabel = input.fromLabel?.trim() || "Someone";
  const subject =
    env.CLAWQL_CREDITS_INVITE_EMAIL_SUBJECT?.trim() ||
    `${fromLabel} requested $${amountUsd.toFixed(2)} via ClawQL`;

  const lines = [
    `${fromLabel} requested $${amountUsd.toFixed(2)} in ClawQL prepaid credits.`,
    input.note?.trim() ? `Note: ${input.note.trim()}` : undefined,
    input.expiresAt ? `Expires: ${input.expiresAt}` : undefined,
    "",
    "Open this invite link to join and pay:",
    input.inviteUrl,
    "",
    "Or claim in the CLI:",
    `clawql payments credits request claim-invite --request-id ${input.requestId}${
      input.inviteToken ? ` --token ${input.inviteToken}` : " --token <TOKEN>"
    } --tenant-id <your-id>`,
    "",
    "Money only moves after you accept and confirm (stage → confirm + optional TOTP).",
    "— ClawQL Payments",
  ].filter((l): l is string => l !== undefined);

  const text = lines.join("\n");
  const html = `
<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0b1f1c;background:#f4fbf8;padding:24px">
  <h1 style="font-size:1.4rem;margin:0 0 8px">ClawQL</h1>
  <p>${escapeHtml(fromLabel)} requested <strong>$${amountUsd.toFixed(2)}</strong> in prepaid credits.</p>
  ${input.note?.trim() ? `<p style="color:#3d5a54">Note: ${escapeHtml(input.note.trim())}</p>` : ""}
  <p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#0d6e62;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Open invite</a></p>
  <p style="font-size:0.85rem;color:#3d5a54;word-break:break-all">${escapeHtml(input.inviteUrl)}</p>
  <p style="font-size:0.8rem;color:#3d5a54">Money moves only after stage → confirm (+ optional TOTP).</p>
</body></html>`.trim();

  const provider = creditsInviteEmailProvider(env);
  return {
    to: input.toEmail.trim().toLowerCase(),
    from: creditsInviteEmailFrom(env),
    subject,
    text,
    html,
    meta: {
      requestId: input.requestId,
      inviteUrl: input.inviteUrl,
      amountUsd,
      provider,
      dryRun: provider === "dry-run" || isCreditsInviteEmailDryRun(env),
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendInviteEmailOptions = {
  /** Force dry-run regardless of env. */
  dryRun?: boolean;
  /** Override provider. */
  provider?: InviteEmailProvider;
  fetchImpl?: typeof fetch;
};

/**
 * Deliver (or dry-run) a money-request invite email.
 * Does not throw on provider HTTP errors — returns `{ ok: false, error }`.
 */
export async function sendMoneyRequestInviteEmail(
  input: MoneyRequestInviteEmailInput,
  env: NodeJS.ProcessEnv = process.env,
  options: SendInviteEmailOptions = {}
): Promise<InviteEmailResult> {
  const payload = buildMoneyRequestInviteEmail(input, env);
  const dryRun =
    options.dryRun === true ||
    (options.dryRun !== false && (payload.meta.dryRun || options.provider === "dry-run"));
  const provider: InviteEmailProvider = dryRun
    ? "dry-run"
    : options.provider ?? creditsInviteEmailProvider(env);

  const base: InviteEmailResult = {
    ok: true,
    provider,
    dryRun: provider === "dry-run",
    to: payload.to,
    subject: payload.subject,
    previewText: payload.text,
  };

  if (provider === "dry-run") {
    return { ...base, messageId: `dry-run-${input.requestId}` };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ...base, ok: false, error: "fetch is not available in this runtime" };
  }

  try {
    if (provider === "webhook") {
      const url = env.CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL?.trim();
      if (!url) {
        return { ...base, ok: false, error: "CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL not set" };
      }
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_TOKEN?.trim()
            ? {
                authorization: `Bearer ${env.CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_TOKEN.trim()}`,
              }
            : {}),
        },
        body: JSON.stringify({
          type: "credits.money_request.invite",
          to: payload.to,
          from: payload.from,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          meta: payload.meta,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ...base,
          ok: false,
          error: `webhook HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        };
      }
      let messageId: string | undefined;
      try {
        const json = (await res.json()) as { id?: string; messageId?: string };
        messageId = json.messageId ?? json.id;
      } catch {
        /* optional */
      }
      return { ...base, messageId: messageId ?? `webhook-${input.requestId}` };
    }

    if (provider === "resend") {
      const apiKey = env.CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY?.trim();
      if (!apiKey) {
        return {
          ...base,
          ok: false,
          error: "CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY not set",
        };
      }
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: payload.from,
          to: [payload.to],
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
        }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        return {
          ...base,
          ok: false,
          error: `resend HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
        };
      }
      let messageId: string | undefined;
      try {
        messageId = (JSON.parse(bodyText) as { id?: string }).id;
      } catch {
        /* optional */
      }
      return { ...base, messageId };
    }

    return { ...base, ok: false, error: `Unknown provider ${provider}` };
  } catch (e) {
    return {
      ...base,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Whether create/invoice should attempt delivery (enabled flag, or explicit CLI --send-email).
 */
export function shouldSendInviteEmailOnCreate(
  options: { sendEmail?: boolean } = {},
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (options.sendEmail === false) return false;
  if (options.sendEmail === true) return true;
  return isCreditsInviteEmailEnabled(env);
}
