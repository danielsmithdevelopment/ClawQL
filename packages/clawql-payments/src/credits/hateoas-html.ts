/**
 * Hosted mini UI + HTMX shell for credits HATEOAS views.
 * X Money–inspired grammar (balance + verbs + recent), ClawQL brand-first — not a bank dashboard.
 */

import QRCode from "qrcode";
import { Data, Effect } from "effect";
import type { HateoasEnvelope } from "./deeplinks.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const escapeHtml = (s: string): Effect.Effect<string> => Effect.sync(() => esc(s));

/** QR render failure (qrcode lib). */
export class QrRenderError extends Data.TaggedError("QrRenderError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export const renderQrSvg = (payload: string): Effect.Effect<string, QrRenderError> =>
  Effect.tryPromise({
    try: () =>
      QRCode.toString(payload, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320,
        color: { dark: "#0b1f1c", light: "#00000000" },
      }),
    catch: (cause) =>
      new QrRenderError({
        reason: cause instanceof Error ? cause.message : "QR render failed",
        cause,
      }),
  });

const MINI_UI_STYLES = `
  :root {
    --ink: #0b1f1c;
    --muted: #3d5a54;
    --foam: #f4fbf8;
    --accent: #0d6e62;
    --accent-deep: #084c44;
    --err: #9b2c2c;
    --line: rgba(11, 31, 28, 0.12);
    --tile: rgba(255,255,255,0.55);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
    background:
      radial-gradient(1100px 520px at 8% -8%, #b8e4d8 0%, transparent 55%),
      radial-gradient(800px 420px at 100% 0%, #cfe8e0 0%, transparent 48%),
      linear-gradient(165deg, #dff3ec 0%, var(--foam) 45%, #eef6f3 100%);
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.28;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Cpath d='M0 36h72M36 0v72' stroke='%230b1f1c' stroke-opacity='0.045'/%3E%3C/svg%3E");
  }
  .shell {
    position: relative;
    max-width: 26rem;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.35rem 1.15rem 2.25rem;
  }
  .topbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    animation: rise 0.55s ease-out both;
  }
  .brand {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 700;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
    margin: 0;
  }
  .brand span { color: var(--accent); }
  .tenant {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .balance-block {
    margin-top: 1.75rem;
    animation: rise 0.55s ease-out 0.05s both;
  }
  .balance-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .balance-label button {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0.1rem;
    cursor: pointer;
    color: var(--muted);
    line-height: 1;
  }
  .amount {
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(2.75rem, 12vw, 3.5rem);
    letter-spacing: -0.04em;
    margin: 0.2rem 0 0;
    animation: amountIn 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.08s both;
  }
  .amount.is-hidden { filter: blur(7px); user-select: none; }
  .lede {
    margin: 0.45rem 0 0;
    color: var(--muted);
    font-size: 0.95rem;
  }
  .verbs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.55rem;
    margin: 1.6rem 0 0;
    animation: rise 0.55s ease-out 0.12s both;
  }
  .verb {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 4.4rem;
    padding: 0.65rem 0.25rem;
    text-decoration: none;
    color: var(--ink);
    background: var(--tile);
    border: 1px solid var(--line);
    border-radius: 0.85rem;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .verb:hover { border-color: var(--accent); }
  .verb svg { width: 1.35rem; height: 1.35rem; stroke: var(--ink); fill: none; stroke-width: 1.7; }
  .section {
    margin-top: 1.75rem;
    animation: rise 0.55s ease-out 0.16s both;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.65rem;
  }
  .section-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .section-head a {
    font-size: 0.8rem;
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .activity {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .activity li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--line);
  }
  .activity .who { font-weight: 600; }
  .activity .when { display: block; font-size: 0.75rem; color: var(--muted); font-weight: 400; margin-top: 0.15rem; }
  .activity .amt { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .activity .amt.pos { color: var(--accent); }
  .activity a { color: inherit; text-decoration: none; }
  .empty { color: var(--muted); font-size: 0.9rem; margin: 0; }
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.85rem;
  }
  button.primary, .btn {
    appearance: none;
    border: 0;
    border-radius: 0.55rem;
    padding: 0.7rem 1.05rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    color: #fff;
    background: var(--accent);
  }
  button.primary:hover, .btn:hover { background: var(--accent-deep); }
  .btn.ghost, button.ghost {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 0.85rem;
    padding: 1.25rem 0 0.5rem;
  }
  .payee { font-size: 1.15rem; margin: 0; }
  .visual {
    margin: 0.75rem -1.15rem 0;
    padding: 1.35rem 1.15rem;
    border-block: 1px solid var(--line);
    background: linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.05));
    display: grid;
    place-items: center;
  }
  .visual img, .visual svg { width: min(260px, 70vw); height: auto; display: block; }
  .note { color: var(--muted); margin: 0; font-size: 0.92rem; }
  .meta-block {
    margin-top: auto;
    padding-top: 1.1rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .meta-block summary { cursor: pointer; font-weight: 600; color: var(--ink); }
  .meta-block pre, code {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.78rem;
  }
  .meta-block pre {
    background: var(--ink);
    color: #e8f5f1;
    padding: 0.75rem;
    border-radius: 0.4rem;
    overflow: auto;
  }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin: 0.75rem 0 0.3rem; }
  input {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 0.55rem;
    font: inherit;
    background: rgba(255,255,255,0.72);
  }
  .compose-grid { display: grid; gap: 0.15rem; }
  .page-title {
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.85rem;
    letter-spacing: -0.03em;
    margin: 1.1rem 0 0.25rem;
  }
  .back {
    font-size: 0.85rem;
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .err { color: var(--err); }
  .muted { color: var(--muted); }
  @keyframes rise {
    from { transform: translateY(8px); }
    to { transform: none; }
  }
  @keyframes amountIn {
    from { transform: scale(0.97); }
    to { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; }
  }
`;

function fontLinks(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />`;
}

const ICON_DEPOSIT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-2-7-8-1z"/></svg>`;
const ICON_REQUEST = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4H8zM4 10h6v6H4zM14 10h6v6h-6zM9 17h6v3H9z"/></svg>`;
const ICON_ACTIVITY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h4l2-6 3 10 2-5h5"/></svg>`;

function renderHateoasHtmlDoc(input: {
  title: string;
  summary: string;
  envelope: HateoasEnvelope;
  bodyHtml: string;
  hideLinksPanel?: boolean;
}): string {
  const links = Object.entries(input.envelope.links)
    .filter(([, v]) => v)
    .map(
      ([rel, href]) => `<li><a rel="${esc(rel)}" href="${esc(String(href))}">${esc(rel)}</a></li>`
    )
    .join("\n");

  const linksBlock = input.hideLinksPanel
    ? ""
    : `<div class="meta-block">
      <details>
        <summary>HATEOAS links</summary>
        <ul>${links || "<li>(none)</li>"}</ul>
      </details>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(input.title)} · ClawQL</title>
  ${fontLinks()}
  <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LPqG9RFHx" crossorigin="anonymous"></script>
  <style>${MINI_UI_STYLES}</style>
</head>
<body>
  <div class="shell">
    ${input.bodyHtml}
    ${linksBlock}
  </div>
</body>
</html>`;
}

export const renderHateoasHtml = (input: {
  title: string;
  summary: string;
  envelope: HateoasEnvelope;
  bodyHtml: string;
  hideLinksPanel?: boolean;
}): Effect.Effect<string> => Effect.sync(() => renderHateoasHtmlDoc(input));

function renderCreditsHateoasPageDoc(input: {
  title: string;
  heading?: string;
  summary?: string;
  bodyHtml: string;
  envelope?: HateoasEnvelope;
  hideLinksPanel?: boolean;
}): string {
  const envelope =
    input.envelope ??
    ({
      ok: true,
      kind: "credits.view",
      summary: input.summary ?? input.heading ?? input.title,
      data: {},
      links: { self: "#" },
      approval_url: null,
    } satisfies HateoasEnvelope);
  return renderHateoasHtmlDoc({
    title: input.heading ?? input.title,
    summary: input.summary ?? envelope.summary,
    envelope,
    bodyHtml: input.bodyHtml,
    hideLinksPanel: input.hideLinksPanel,
  });
}

export const renderCreditsHateoasPage = (input: {
  title: string;
  heading?: string;
  summary?: string;
  bodyHtml: string;
  envelope?: HateoasEnvelope;
  hideLinksPanel?: boolean;
}): Effect.Effect<string> => Effect.sync(() => renderCreditsHateoasPageDoc(input));

export type MiniHomeRecentItem = {
  title: string;
  when: string;
  amountLabel: string;
  positive?: boolean;
  href?: string;
};

export type MiniHomeInput = {
  tenantId: string;
  label?: string;
  balanceCents: number;
  recent: MiniHomeRecentItem[];
};

/** Home: brand + balance + four verbs + recent (X Money grammar, ClawQL voice). */
export const renderCreditsMiniHomeHtml = (input: MiniHomeInput): Effect.Effect<string> =>
  Effect.sync(() => renderCreditsMiniHomeDoc(input));

function renderCreditsMiniHomeDoc(input: MiniHomeInput): string {
  const dollars = (input.balanceCents / 100).toFixed(2);
  const q = new URLSearchParams({ tenant: input.tenantId }).toString();
  const recent =
    input.recent.length === 0
      ? `<p class="empty">No recent activity yet.</p>`
      : `<ul class="activity">${input.recent
          .map((r) => {
            const inner = `<div><span class="who">${esc(r.title)}</span><span class="when">${esc(r.when)}</span></div>
            <span class="amt${r.positive ? " pos" : ""}">${esc(r.amountLabel)}</span>`;
            return `<li>${
              r.href ? `<a href="${esc(r.href)}" style="display:contents">${inner}</a>` : inner
            }</li>`;
          })
          .join("")}</ul>`;

  const body = `
    <div class="topbar">
      <h1 class="brand">Claw<span>QL</span></h1>
      <span class="tenant">${esc(input.label ?? input.tenantId)}</span>
    </div>
    <section class="balance-block" aria-label="Balance">
      <p class="balance-label">
        Total balance
        <button type="button" id="toggle-bal" aria-label="Hide balance" title="Hide balance">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </p>
      <p class="amount" id="bal-amount">$${esc(dollars)}</p>
      <p class="lede">Prepaid credits · authorize with a magic link or CLI confirm.</p>
    </section>
    <nav class="verbs" aria-label="Actions">
      <a class="verb" href="/credits/topup?${esc(q)}">${ICON_DEPOSIT}<span>Top up</span></a>
      <a class="verb" href="/credits/pay?${esc(q)}">${ICON_SEND}<span>Pay</span></a>
      <a class="verb" href="/credits/request/new?${esc(q)}">${ICON_REQUEST}<span>Request</span></a>
      <a class="verb" href="/credits/activity?${esc(q)}">${ICON_ACTIVITY}<span>Activity</span></a>
    </nav>
    <section class="section" aria-label="Recent activity">
      <div class="section-head">
        <h2>Activity</h2>
        <a href="/credits/activity?${esc(q)}">See all</a>
      </div>
      ${recent}
    </section>
    <script>
      (function () {
        var btn = document.getElementById("toggle-bal");
        var amt = document.getElementById("bal-amount");
        if (!btn || !amt) return;
        var hidden = false;
        btn.addEventListener("click", function () {
          hidden = !hidden;
          amt.classList.toggle("is-hidden", hidden);
          btn.setAttribute("aria-label", hidden ? "Show balance" : "Hide balance");
        });
      })();
    </script>
  `;
  return renderCreditsHateoasPageDoc({
    title: "ClawQL Payments",
    heading: "ClawQL",
    summary: "Prepaid credits home",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

/** Pay compose — Send screen. */
export const renderCreditsPayComposeHtml = (tenantId: string): Effect.Effect<string> =>
  Effect.sync(() => renderCreditsPayComposeDoc(tenantId));

function renderCreditsPayComposeDoc(tenantId: string): string {
  const q = new URLSearchParams({ tenant: tenantId }).toString();
  const body = `
    <a class="back" href="/credits?${esc(q)}">← Home</a>
    <h1 class="page-title">Pay</h1>
    <p class="lede">Build a pay link. Confirm still happens in the CLI.</p>
    <form class="compose-grid" method="get" action="/credits/pay">
      <input type="hidden" name="tenant" value="${esc(tenantId)}" />
      <label>To (email, @username, or phone)
        <input name="to" required placeholder="@bob or you@acme.com or +15551234567" autocomplete="off" />
      </label>
      <label>Amount (USD)
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="10" required />
      </label>
      <label>Note
        <input name="note" placeholder="coffee" />
      </label>
      <div class="cta-row">
        <button class="primary" type="submit">Continue</button>
      </div>
    </form>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Pay",
    heading: "Pay",
    summary: "Compose a credits payment",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

/** Request compose. */
export const renderCreditsRequestComposeHtml = (tenantId: string): Effect.Effect<string> =>
  Effect.sync(() => renderCreditsRequestComposeDoc(tenantId));

function renderCreditsRequestComposeDoc(tenantId: string): string {
  const q = new URLSearchParams({ tenant: tenantId }).toString();
  const body = `
    <a class="back" href="/credits?${esc(q)}">← Home</a>
    <h1 class="page-title">Request</h1>
    <p class="lede">Invoices use the CLI today — copy a starter command.</p>
    <form class="compose-grid" id="req-form">
      <label>From (your tenant)
        <input name="from" value="${esc(tenantId)}" required />
      </label>
      <label>To (email, @username, or phone)
        <input name="to" required placeholder="newbie@acme.com or @bob" />
      </label>
      <label>Amount (USD)
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="25" required />
      </label>
      <label>Note
        <input name="note" placeholder="invoice" />
      </label>
      <div class="cta-row">
        <button class="primary" type="submit">Copy CLI</button>
      </div>
    </form>
    <pre id="req-out" class="meta-block" style="display:none;margin-top:1rem"></pre>
    <script>
      document.getElementById("req-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var to = String(fd.get("to") || "").trim();
        var amount = String(fd.get("amount") || "").trim();
        var note = String(fd.get("note") || "").trim();
        var from = String(fd.get("from") || "").trim();
        var cmd = "clawql payments credits request --from-tenant " + from +
          " --to " + JSON.stringify(to) + " --amount " + amount +
          (note ? " --note " + JSON.stringify(note) : "");
        var out = document.getElementById("req-out");
        out.style.display = "block";
        out.textContent = cmd;
        if (navigator.clipboard) navigator.clipboard.writeText(cmd);
      });
    </script>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Request",
    heading: "Request",
    summary: "Compose a money request",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export const renderCreditsTopupHtml = (tenantId: string): Effect.Effect<string> =>
  Effect.sync(() => renderCreditsTopupDoc(tenantId));

function renderCreditsTopupDoc(tenantId: string): string {
  const q = new URLSearchParams({ tenant: tenantId }).toString();
  const body = `
    <a class="back" href="/credits?${esc(q)}">← Home</a>
    <h1 class="page-title">Top up</h1>
    <p class="lede">Fund prepaid credits via bank link + ACH (CLI).</p>
    <pre>clawql payments credits bank-link --tenant-id ${esc(tenantId)}
clawql payments credits topup --tenant-id ${esc(tenantId)} --amount 50</pre>
    <p class="note" style="margin-top:1rem">No debit card or cash deposit in this surface — bank ACH only.</p>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Top up",
    heading: "Top up",
    summary: "ACH top-up via CLI",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export const renderCreditsActivityHtml = (input: {
  tenantId: string;
  label?: string;
  balanceCents: number;
  recent: MiniHomeRecentItem[];
}): Effect.Effect<string> => Effect.sync(() => renderCreditsActivityDoc(input));

function renderCreditsActivityDoc(input: {
  tenantId: string;
  label?: string;
  balanceCents: number;
  recent: MiniHomeRecentItem[];
}): string {
  const q = new URLSearchParams({ tenant: input.tenantId }).toString();
  const list =
    input.recent.length === 0
      ? `<p class="empty">No activity yet.</p>`
      : `<ul class="activity">${input.recent
          .map(
            (r) => `<li>
            <div><span class="who">${esc(r.title)}</span><span class="when">${esc(r.when)}</span></div>
            <span class="amt${r.positive ? " pos" : ""}">${esc(r.amountLabel)}</span>
          </li>`
          )
          .join("")}</ul>`;
  const body = `
    <a class="back" href="/credits?${esc(q)}">← Home</a>
    <h1 class="page-title">Activity</h1>
    <p class="lede">${esc(input.label ?? input.tenantId)} · $${esc(
      (input.balanceCents / 100).toFixed(2)
    )}</p>
    <section class="section">${list}</section>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Activity",
    heading: "Activity",
    summary: "Recent credits activity",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export type TransferApproveInput = {
  actionId: string;
  code: string;
  fromTenantId: string;
  toTenantId: string;
  amountUsd: number;
  note?: string;
  expiresAt: string;
  totpRequired: boolean;
  status: string;
};

/** GET-safe magic-link review before money moves. */
export const renderCreditsTransferApproveHtml = (
  input: TransferApproveInput
): Effect.Effect<string> => Effect.sync(() => renderCreditsTransferApproveDoc(input));

function renderCreditsTransferApproveDoc(input: TransferApproveInput): string {
  const dollars = input.amountUsd.toFixed(2);
  const pending = input.status === "pending";
  const body = `
    <a class="back" href="/credits">← Home</a>
    <div class="topbar" style="margin-top:0.75rem">
      <h1 class="brand">Claw<span>QL</span></h1>
    </div>
    <section class="hero" aria-label="Authorize transfer">
      <p class="lede">Magic link · review before money moves</p>
      <p class="amount">$${esc(dollars)}</p>
      <p class="payee"><strong>${esc(input.fromTenantId)}</strong> → <strong>${esc(input.toTenantId)}</strong>${
        input.note ? ` · ${esc(input.note)}` : ""
      }</p>
      <p class="note">Status: <code>${esc(input.status)}</code> · expires ${esc(input.expiresAt.slice(0, 19))}Z</p>
      ${
        pending
          ? `
      <form method="post" action="/credits/transfer/confirm" class="compose-grid">
        <input type="hidden" name="action_id" value="${esc(input.actionId)}" />
        <input type="hidden" name="code" value="${esc(input.code)}" />
        ${
          input.totpRequired
            ? `<label>Authenticator code (TOTP)
                <input name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6-digit code" />
              </label>`
            : `<p class="note">Confirming moves prepaid credits on the ledger.</p>`
        }
        <div class="cta-row">
          <button class="primary" type="submit">Authorize transfer</button>
          <a class="btn ghost" href="/credits/transfer/cancel?action_id=${esc(input.actionId)}&amp;code=${esc(input.code)}">Cancel</a>
        </div>
      </form>`
          : `<p class="note">This magic link is no longer pending — nothing else to authorize.</p>
             <div class="cta-row"><a class="btn" href="/credits">Back home</a></div>`
      }
    </section>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Authorize transfer",
    heading: "ClawQL",
    summary: `Authorize $${dollars} transfer`,
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export const renderCreditsTransferConfirmedHtml = (input: {
  fromTenantId: string;
  toTenantId: string;
  amountUsd: number;
  transferId: string;
}): Effect.Effect<string> => Effect.sync(() => renderCreditsTransferConfirmedDoc(input));

function renderCreditsTransferConfirmedDoc(input: {
  fromTenantId: string;
  toTenantId: string;
  amountUsd: number;
  transferId: string;
}): string {
  const body = `
    <a class="back" href="/credits">← Home</a>
    <div class="topbar" style="margin-top:0.75rem">
      <h1 class="brand">Claw<span>QL</span></h1>
    </div>
    <section class="hero">
      <p class="lede">Transfer authorized</p>
      <p class="amount">$${esc(input.amountUsd.toFixed(2))}</p>
      <p class="payee"><strong>${esc(input.fromTenantId)}</strong> → <strong>${esc(input.toTenantId)}</strong></p>
      <p class="note">Ledger id <code>${esc(input.transferId)}</code></p>
      <div class="cta-row">
        <a class="btn" href="/credits/activity?tenant=${esc(input.fromTenantId)}">View activity</a>
      </div>
    </section>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Transfer authorized",
    heading: "ClawQL",
    summary: "Credits transfer confirmed",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export const renderCreditsTransferCancelledHtml = (actionId: string): Effect.Effect<string> =>
  Effect.sync(() => renderCreditsTransferCancelledDoc(actionId));

function renderCreditsTransferCancelledDoc(actionId: string): string {
  const body = `
    <a class="back" href="/credits">← Home</a>
    <section class="hero">
      <h1 class="page-title" style="margin-top:0">Cancelled</h1>
      <p class="lede">Staged transfer <code>${esc(actionId)}</code> was cancelled. No money moved.</p>
      <div class="cta-row"><a class="btn" href="/credits">Back home</a></div>
    </section>
  `;
  return renderCreditsHateoasPageDoc({
    title: "Transfer cancelled",
    heading: "Cancelled",
    summary: "Staged transfer cancelled",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

/** HTMX fragment after accept/stage — points at magic-link authorize. */
export const renderCreditsStagedTransferHtml = (input: {
  actionId: string;
  confirmationCode: string;
  approvalUrl: string;
  totpRequired: boolean;
  requestStatus?: string;
}): Effect.Effect<string> => Effect.sync(() => renderCreditsStagedTransferDoc(input));

function renderCreditsStagedTransferDoc(input: {
  actionId: string;
  confirmationCode: string;
  approvalUrl: string;
  totpRequired: boolean;
  requestStatus?: string;
}): string {
  const path = `/credits/transfer/approve?action_id=${encodeURIComponent(input.actionId)}&code=${encodeURIComponent(input.confirmationCode)}`;
  return `
    <div class="hero" style="padding-top:0.5rem">
      <p><strong>Staged</strong> — money not moved yet.</p>
      <p class="lede">Open the magic link to authorize (or cancel).</p>
      <div class="cta-row">
        <a class="btn" href="${esc(path)}">Authorize with magic link</a>
      </div>
      <p class="note" style="margin-top:0.85rem">Also: <a href="${esc(input.approvalUrl)}">${esc(input.approvalUrl)}</a></p>
      ${input.totpRequired ? `<p class="note">TOTP required on authorize.</p>` : ""}
      ${input.requestStatus ? `<p class="muted">Request status: ${esc(input.requestStatus)}</p>` : ""}
      <details class="meta-block">
        <summary>CLI fallback</summary>
        <pre>clawql payments credits transfer --confirm --action-id ${esc(input.actionId)} --code ${esc(input.confirmationCode)}${input.totpRequired ? " --totp NNNNNN" : ""}</pre>
      </details>
    </div>
  `;
}

export const wantsHtml = (acceptHeader: string | undefined): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const a = (acceptHeader ?? "").toLowerCase();
    if (a.includes("application/json") && !a.includes("text/html")) return false;
    if (a.includes("text/html")) return true;
    return a.includes("mozilla");
  });
