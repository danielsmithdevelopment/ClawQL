import { Effect } from "effect";
import { escapeMcpUiHtml } from "./mcp-ui-form.js";
import type { GeneratedUiDefinition } from "./mcp-ui-generate.js";

export type CloudflareClaimLandingOpts = {
  basePath: string;
  title: string;
  definition: GeneratedUiDefinition;
  error?: string;
};

const STYLES = `
:root {
  --bg: #0b1220;
  --surface: #141c2b;
  --ink: #eef3fb;
  --muted: #9aa8bc;
  --orange: #f6821f;
  --line: #243044;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  color: var(--ink);
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 90% -10%, rgba(246,130,31,0.22), transparent 55%),
    radial-gradient(700px 360px at 0% 0%, rgba(56,189,248,0.12), transparent 50%),
    var(--bg);
}
.page { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
.badge {
  display: inline-block;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--orange);
  font-weight: 700;
  margin-bottom: 0.7rem;
}
h1 { margin: 0 0 0.5rem; font-size: 1.8rem; letter-spacing: -0.02em; }
.lede { color: var(--muted); line-height: 1.55; margin: 0 0 1.1rem; }
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.1rem 1.2rem;
  margin: 1rem 0;
}
.card h2 { margin: 0 0 0.55rem; font-size: 1.02rem; }
.flow { display: grid; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.flow li {
  display: grid;
  grid-template-columns: 1.6rem 1fr;
  gap: 0.55rem;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.flow strong { color: var(--ink); }
.flow code { color: var(--orange); font-size: 0.85em; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.2rem; }
.btn {
  display: inline-block;
  background: var(--orange);
  color: #1a0f05;
  font-weight: 700;
  text-decoration: none;
  border: none;
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
  font-size: 0.95rem;
}
.btn--ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line);
}
.note { font-size: 0.84rem; color: var(--muted); margin-top: 1rem; line-height: 1.45; }
.err { color: #fecaca; }
a { color: var(--orange); }
`;

export const renderCloudflareClaimLandingPage = (
  opts: CloudflareClaimLandingOpts
): Effect.Effect<string> =>
  Effect.sync(() => {
    const base = opts.basePath.replace(/\/$/, "") || "/mcp-ui";
    const steps = opts.definition.steps
      .map(
        (s, i) =>
          `<li><span>${i + 1}.</span><span><strong>${escapeMcpUiHtml(s.label ?? s.tool)}</strong> — <code>${escapeMcpUiHtml(s.tool)}</code></span></li>`
      )
      .join("");
    const err = opts.error
      ? `<div class="card err" role="alert"><p>${escapeMcpUiHtml(opts.error)}</p></div>`
      : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeMcpUiHtml(opts.definition.title)} — MCP UI</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="page">
    <div class="badge">Protocol Fabric · third-party WebMCP → /mcp-ui</div>
    <h1>${escapeMcpUiHtml(opts.definition.title)}</h1>
    <p class="lede">${escapeMcpUiHtml(
      opts.definition.description ??
        "Wrap a third-party agent coupon tool and turn it back into a human click-to-claim UI."
    )}</p>
    ${err}
    <section class="card">
      <h2>The loop</h2>
      <ol class="flow">
        <li><span>1</span><span>Third-party page registers WebMCP tools (agent-facing coupon claim).</span></li>
        <li><span>2</span><span>ClawQL indexes them as a WebMCP source (<code>clawql sources add --kind webmcp</code>).</span></li>
        <li><span>3</span><span><code>mcp-api-adapter</code> scaffolds <code>/mcp-ui</code> — a <strong>Click to claim</strong> button humans can press.</span></li>
      </ol>
    </section>
    <section class="card">
      <h2>This preset’s tools</h2>
      <ol class="flow">${steps || "<li><span>·</span><span>No matching tools in catalog yet.</span></li>"}</ol>
    </section>
    <div class="actions">
      <form method="post" action="${escapeMcpUiHtml(base)}/presets/cloudflare-claim/start">
        <button class="btn" type="submit">Start click-to-claim workflow</button>
      </form>
      <a class="btn btn--ghost" href="${escapeMcpUiHtml(base)}">← Catalog</a>
      <a class="btn btn--ghost" href="${escapeMcpUiHtml(base)}#tool-cf_claim_coupon">Claim tool card</a>
    </div>
    <p class="note">
      Demo upstream: <code>node examples/mcp-api-adapter/cloudflare-claim-server.mjs</code>.
      Third-party WebMCP page: <code>examples/mcp-api-adapter/cloudflare-claim/site.html</code>.
      This is a local mock of the Cloudflare-style agent coupon pattern — not Cloudflare production.
    </p>
  </div>
</body>
</html>`;
  });

export const runRenderCloudflareClaimLandingPage = (
  opts: CloudflareClaimLandingOpts
): string => Effect.runSync(renderCloudflareClaimLandingPage(opts));
