/**
 * Hosted mini UI + HTMX shell for credits HATEOAS views.
 * Brand-first composition — not a dashboard.
 */

import QRCode from "qrcode";
import type { HateoasEnvelope } from "./deeplinks.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtml(s: string): string {
  return esc(s);
}

export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#0b1f1c", light: "#00000000" },
  });
}

const MINI_UI_STYLES = `
  :root {
    --ink: #0b1f1c;
    --muted: #3d5a54;
    --fog: #e7f2ef;
    --foam: #f4fbf8;
    --accent: #0d6e62;
    --accent-deep: #084c44;
    --err: #9b2c2c;
    --line: rgba(11, 31, 28, 0.12);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #b8e4d8 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #d7ebe4 0%, transparent 50%),
      linear-gradient(165deg, #dff3ec 0%, var(--foam) 42%, #eef6f3 100%);
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.35;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M0 40h80M40 0v80' stroke='%230b1f1c' stroke-opacity='0.04'/%3E%3C/svg%3E");
  }
  .shell {
    position: relative;
    max-width: 40rem;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1.25rem 2.5rem;
  }
  .brand {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 700;
    font-size: clamp(2rem, 6vw, 2.75rem);
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 0;
    animation: rise 0.7s ease-out both;
  }
  .brand span { color: var(--accent); }
  .lede {
    margin: 0.65rem 0 0;
    color: var(--muted);
    font-size: 1.05rem;
    max-width: 28rem;
    animation: rise 0.7s ease-out 0.08s both;
  }
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.25rem;
    padding: 1.5rem 0 1rem;
  }
  .amount {
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(2.5rem, 10vw, 3.75rem);
    letter-spacing: -0.04em;
    margin: 0;
    animation: amountIn 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s both;
  }
  .payee {
    font-size: 1.25rem;
    margin: 0;
    animation: rise 0.7s ease-out 0.18s both;
  }
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.35rem;
    animation: rise 0.7s ease-out 0.22s both;
  }
  button, .btn {
    appearance: none;
    border: 0;
    border-radius: 0.35rem;
    padding: 0.7rem 1.05rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    color: #fff;
    background: var(--accent);
  }
  button:hover, .btn:hover { background: var(--accent-deep); }
  .btn.ghost {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .visual {
    margin: 0.5rem -1.25rem 0;
    padding: 1.5rem 1.25rem 1.75rem;
    background: linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05));
    border-block: 1px solid var(--line);
    display: grid;
    place-items: center;
    animation: fadeVisual 0.9s ease-out 0.2s both;
  }
  .visual img, .visual svg {
    width: min(280px, 70vw);
    height: auto;
    display: block;
  }
  .note { color: var(--muted); margin: 0; font-size: 0.95rem; }
  .meta-block {
    margin-top: auto;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .meta-block summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--ink);
  }
  .meta-block pre, code {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.78rem;
  }
  .meta-block pre {
    background: var(--ink);
    color: #e8f5f1;
    padding: 0.75rem;
    border-radius: 0.35rem;
    overflow: auto;
  }
  ul.links { padding-left: 1.1rem; }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin: 0.75rem 0 0.3rem; }
  input {
    width: 100%;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.35rem;
    font: inherit;
    background: rgba(255,255,255,0.7);
  }
  .compose-grid { display: grid; gap: 0.25rem; max-width: 22rem; }
  .err { color: var(--err); }
  .muted { color: var(--muted); }
  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes amountIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: none; }
  }
  @keyframes fadeVisual {
    from { opacity: 0; }
    to { opacity: 1; }
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

export function renderHateoasHtml(input: {
  title: string;
  summary: string;
  envelope: HateoasEnvelope;
  bodyHtml: string;
  /** When true, hide the secondary HATEOAS panel (hero-only compose). */
  hideLinksPanel?: boolean;
}): string {
  const links = Object.entries(input.envelope.links)
    .filter(([, v]) => v)
    .map(
      ([rel, href]) =>
        `<li><a rel="${esc(rel)}" href="${esc(String(href))}">${esc(rel)}</a></li>`
    )
    .join("\n");

  const linksBlock = input.hideLinksPanel
    ? ""
    : `<div class="meta-block">
      <details>
        <summary>HATEOAS links</summary>
        <ul class="links">${links || "<li>(none)</li>"}</ul>
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

/** Convenience wrapper when you only need title + body. */
export function renderCreditsHateoasPage(input: {
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
  return renderHateoasHtml({
    title: input.heading ?? input.title,
    summary: input.summary ?? envelope.summary,
    envelope,
    bodyHtml: input.bodyHtml,
    hideLinksPanel: input.hideLinksPanel,
  });
}

/** One-screen compose home — brand, headline, pay/request CTAs. */
export function renderCreditsMiniHomeHtml(): string {
  const body = `
    <header>
      <h1 class="brand">Claw<span>QL</span></h1>
      <p class="lede">Prepaid credits, human-simple. Pay or request — confirm stays in the CLI.</p>
    </header>
    <section class="hero" aria-label="Compose">
      <form class="compose-grid" method="get" action="/credits/pay">
        <label>To (email, @username, or phone)
          <input name="to" required placeholder="@bob or you@acme.com or +15551234567" autocomplete="off" />
        </label>
        <label>Amount (USD)
          <input name="amount" type="number" min="0.01" step="0.01" placeholder="10" />
        </label>
        <label>Note
          <input name="note" placeholder="coffee" />
        </label>
        <div class="cta-row">
          <button type="submit">Open pay link</button>
          <a class="btn ghost" href="/credits/pay?to=%40me&amount=10">Demo pay</a>
        </div>
      </form>
      <p class="note">Money moves only after <code>credits transfer --confirm</code> (+ optional TOTP).</p>
    </section>
  `;
  return renderCreditsHateoasPage({
    title: "ClawQL Payments",
    heading: "ClawQL",
    summary: "Prepaid credits mini UI",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

export function wantsHtml(acceptHeader: string | undefined): boolean {
  const a = (acceptHeader ?? "").toLowerCase();
  if (a.includes("application/json") && !a.includes("text/html")) return false;
  if (a.includes("text/html")) return true;
  return a.includes("mozilla");
}
