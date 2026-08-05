/**
 * Minimal HTMX-friendly HTML for credits HATEOAS views (GET-safe by default).
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
    margin: 2,
    width: 256,
  });
}

export function renderHateoasHtml(input: {
  title: string;
  summary: string;
  envelope: HateoasEnvelope;
  bodyHtml: string;
}): string {
  const links = Object.entries(input.envelope.links)
    .filter(([, v]) => v)
    .map(
      ([rel, href]) =>
        `<li><a rel="${esc(rel)}" href="${esc(String(href))}">${esc(rel)}</a></li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(input.title)} · ClawQL</title>
  <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LPqG9RFHx" crossorigin="anonymous"></script>
  <style>
    :root { --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --bg:#f8fafc; --accent:#0f766e; --err:#b91c1c; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; color:var(--ink); background:linear-gradient(180deg,#ecfeff 0%, var(--bg) 40%); min-height:100vh; }
    main { max-width:36rem; margin:0 auto; padding:2rem 1.25rem 3rem; }
    h1 { font-size:1.5rem; letter-spacing:-0.02em; margin:0 0 .35rem; }
    .brand { font-weight:700; color:var(--accent); font-size:.85rem; text-transform:uppercase; letter-spacing:.08em; }
    .summary { color:var(--muted); margin:0 0 1.25rem; line-height:1.45; }
    .panel { background:#fff; border:1px solid var(--line); border-radius:12px; padding:1.1rem 1.2rem; margin-bottom:1rem; }
    label { display:block; font-size:.8rem; color:var(--muted); margin:.65rem 0 .25rem; }
    input { width:100%; box-sizing:border-box; padding:.55rem .65rem; border:1px solid var(--line); border-radius:8px; font:inherit; }
    button, .btn { display:inline-block; margin-top:.9rem; margin-right:.5rem; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:.55rem .9rem; font:inherit; cursor:pointer; text-decoration:none; }
    .btn.secondary { background:#fff; color:var(--ink); border:1px solid var(--line); }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.8rem; }
    pre { background:#0f172a; color:#e2e8f0; padding:.75rem; border-radius:8px; overflow:auto; }
    ul.links { padding-left:1.1rem; color:var(--muted); }
    .meta { font-size:.85rem; color:var(--muted); }
    .muted { color:var(--muted); }
    .err { color:var(--err); }
    dt { font-size:.75rem; color:var(--muted); margin-top:.5rem; }
    dd { margin:0 0 .25rem; }
  </style>
</head>
<body>
  <main>
    <div class="brand">ClawQL Payments</div>
    <h1>${esc(input.title)}</h1>
    <p class="summary">${esc(input.summary)}</p>
    <div id="view" class="panel">
      ${input.bodyHtml}
    </div>
    <div class="panel">
      <div class="meta">HATEOAS links</div>
      <ul class="links">${links || "<li>(none)</li>"}</ul>
    </div>
  </main>
</body>
</html>`;
}

/** Convenience wrapper when you only need title + body (empty link map). */
export function renderCreditsHateoasPage(input: {
  title: string;
  heading?: string;
  summary?: string;
  bodyHtml: string;
  envelope?: HateoasEnvelope;
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
  });
}

export function wantsHtml(acceptHeader: string | undefined): boolean {
  const a = (acceptHeader ?? "").toLowerCase();
  if (a.includes("application/json") && !a.includes("text/html")) return false;
  if (a.includes("text/html")) return true;
  return a.includes("mozilla");
}
