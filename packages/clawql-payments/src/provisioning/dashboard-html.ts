/**
 * CPC self-serve dashboard HTML — full-scope sections:
 * plan/billing, API keys, usage, topology, traces (embedded).
 * Extends credits HATEOAS visual language (wider shell).
 * Spec: docs/specs/billing/customer-dashboard-full-scope-v0.1.md
 */

import { Effect } from "effect";
import type { IssuedApiKeyRecord } from "clawql-auth";
import type { OrgRecord } from "../credits/org.js";
import type { OrgUnifiedSpendSummary } from "../credits/org-spend.js";
import type { PaymentWormEntry } from "../audit/events.js";
import type { AgentNode, GatewayNode, TopologyTree } from "../dashboard/topology-types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DASH_STYLES = `
  :root {
    --ink: #0b1f1c;
    --muted: #3d5a54;
    --foam: #f4fbf8;
    --accent: #0d6e62;
    --accent-deep: #084c44;
    --err: #9b2c2c;
    --ok: #0d6e62;
    --line: rgba(11, 31, 28, 0.12);
    --tile: rgba(255,255,255,0.62);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
    background:
      radial-gradient(1200px 560px at 6% -10%, #b8e4d8 0%, transparent 55%),
      radial-gradient(900px 480px at 100% 0%, #cfe8e0 0%, transparent 50%),
      linear-gradient(165deg, #dff3ec 0%, var(--foam) 42%, #eef6f3 100%);
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.22;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Cpath d='M0 36h72M36 0v72' stroke='%230b1f1c' stroke-opacity='0.045'/%3E%3C/svg%3E");
  }
  .shell {
    position: relative;
    max-width: 64rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }
  .topbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    animation: rise 0.5s ease-out both;
  }
  .brand {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 700;
    font-size: clamp(1.75rem, 4vw, 2.35rem);
    letter-spacing: -0.03em;
    margin: 0;
  }
  .brand span { color: var(--accent); }
  .meta { font-size: 0.88rem; color: var(--muted); }
  .lede {
    margin: 0.65rem 0 0;
    max-width: 36rem;
    color: var(--muted);
    font-size: 1.02rem;
    animation: rise 0.5s ease-out 0.04s both;
  }
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 1.35rem 0 0;
    animation: rise 0.5s ease-out 0.08s both;
  }
  .nav a {
    text-decoration: none;
    color: var(--ink);
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 0.45rem;
    background: var(--tile);
  }
  .nav a:hover { border-color: var(--accent); color: var(--accent-deep); }
  .flash {
    margin-top: 1rem;
    padding: 0.85rem 1rem;
    border-radius: 0.55rem;
    border: 1px solid var(--accent);
    background: rgba(13, 110, 98, 0.08);
    animation: rise 0.45s ease-out both;
  }
  .flash code {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.82rem;
    word-break: break-all;
  }
  .flash .warn { color: var(--err); font-size: 0.85rem; margin: 0.4rem 0 0; }
  section.panel {
    margin-top: 1.75rem;
    padding: 1.15rem 1.1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--tile);
    backdrop-filter: blur(6px);
    animation: rise 0.55s ease-out both;
  }
  section.panel:nth-of-type(1) { animation-delay: 0.1s; }
  section.panel:nth-of-type(2) { animation-delay: 0.14s; }
  section.panel:nth-of-type(3) { animation-delay: 0.18s; }
  section.panel:nth-of-type(4) { animation-delay: 0.22s; }
  section.panel:nth-of-type(5) { animation-delay: 0.26s; }
  section.panel h2 {
    margin: 0;
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
  }
  section.panel .sub {
    margin: 0.35rem 0 0.9rem;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .grid {
    display: grid;
    gap: 0.75rem 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }
  .stat .label { font-size: 0.78rem; color: var(--muted); }
  .stat .value {
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    margin-top: 0.15rem;
  }
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }
  .btn, button.btn {
    appearance: none;
    border: 0;
    border-radius: 0.5rem;
    padding: 0.65rem 0.95rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    color: #fff;
    background: var(--accent);
    display: inline-block;
  }
  .btn:hover, button.btn:hover { background: var(--accent-deep); }
  .btn.ghost, button.ghost {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.55rem 0.35rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  th { font-size: 0.75rem; color: var(--muted); font-weight: 600; }
  .mono {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.8rem;
  }
  .empty { color: var(--muted); font-size: 0.92rem; margin: 0; }
  .status-pill {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    border-radius: 0.3rem;
    background: rgba(13, 110, 98, 0.12);
    color: var(--accent-deep);
  }
  .foot {
    margin-top: 2rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .foot a { color: var(--accent); }
  .topo { list-style: none; margin: 0; padding: 0; }
  .topo > li { margin: 0.35rem 0; }
  .topo details {
    border: 1px solid var(--line);
    border-radius: 0.55rem;
    background: rgba(255,255,255,0.45);
    padding: 0.35rem 0.55rem 0.45rem;
  }
  .topo summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-weight: 600;
    list-style: none;
  }
  .topo summary::-webkit-details-marker { display: none; }
  .topo .children {
    list-style: none;
    margin: 0.45rem 0 0.15rem 1.15rem;
    padding: 0;
    border-left: 2px solid var(--line);
  }
  .topo .children li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    padding: 0.35rem 0 0.35rem 0.7rem;
    font-size: 0.92rem;
  }
  .dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    flex-shrink: 0;
    display: inline-block;
  }
  .dot-healthy { background: #0d6e62; box-shadow: 0 0 0 2px rgba(13,110,98,0.2); }
  .dot-degraded { background: #b7791f; box-shadow: 0 0 0 2px rgba(183,121,31,0.2); }
  .dot-offline { background: #9b2c2c; box-shadow: 0 0 0 2px rgba(155,44,44,0.15); }
  .topo .kind {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .topo .meta-inline { color: var(--muted); font-size: 0.85rem; }
  .topo a.trace {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--accent-deep);
    text-decoration: none;
    border: 1px solid var(--line);
    border-radius: 0.35rem;
    padding: 0.15rem 0.45rem;
    background: var(--tile);
  }
  .topo a.trace:hover { border-color: var(--accent); }
  .empty-topo {
    padding: 1rem 1.1rem;
    border: 1px dashed var(--line);
    border-radius: 0.65rem;
    background: rgba(255,255,255,0.4);
  }
  .empty-topo h3 {
    margin: 0 0 0.35rem;
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.15rem;
  }
  .trace-embed {
    width: 100%;
    min-height: 28rem;
    border: 1px solid var(--line);
    border-radius: 0.65rem;
    background: #fff;
    margin-top: 0.75rem;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 640px) {
    .shell { padding: 1.15rem 0.9rem 2.5rem; }
    .trace-embed { min-height: 20rem; }
  }
`;

export type CpcDashboardModel = {
  org: OrgRecord;
  actorTenantId: string;
  spend: OrgUnifiedSpendSummary;
  keys: IssuedApiKeyRecord[];
  topology: TopologyTree;
  wormEntries: PaymentWormEntry[];
  flashSecret?: string;
  flashMessage?: string;
  portalAvailable: boolean;
  mcpUiTraceBase: string;
  creditsTopupHref: string;
  returnPath: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function renderKeysTable(keys: IssuedApiKeyRecord[], orgId: string, actor: string): string {
  if (!keys.length) {
    return `<p class="empty">No active API keys for this org yet.</p>`;
  }
  const rows = keys
    .map((k) => {
      const scopes = (k.scope ?? []).join(", ");
      return `<tr>
        <td class="mono">${esc(k.id)}</td>
        <td>${esc(k.label ?? "—")}</td>
        <td class="mono">${esc(k.subjectId)}</td>
        <td>${esc(scopes || "—")}</td>
        <td>${esc(k.createdAt.slice(0, 10))}</td>
        <td>
          <form method="post" action="/credits/org/keys/rotate" style="display:inline">
            <input type="hidden" name="orgId" value="${esc(orgId)}" />
            <input type="hidden" name="actorTenantId" value="${esc(actor)}" />
            <input type="hidden" name="keyId" value="${esc(k.id)}" />
            <button class="btn ghost" type="submit">Rotate</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");
  return `<table>
    <thead><tr><th>Key id</th><th>Label</th><th>Subject</th><th>Scopes</th><th>Created</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function relativeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

function agentLabel(a: AgentNode): string {
  if (a.kind === "cell") {
    return `celld cell ${a.agentId}`;
  }
  const type = a.agentType ? a.agentType[0]!.toUpperCase() + a.agentType.slice(1) : "Agent";
  return `${type} ${a.agentId}`;
}

function agentMeta(a: AgentNode): string {
  if (a.kind === "cell") {
    const st = a.cellStatus ?? "resident";
    return `${st}, ${relativeAgo(a.lastActive)}`;
  }
  return `${a.status === "healthy" ? "active" : a.status}, ${relativeAgo(a.lastActive)}`;
}

function renderTopology(tree: TopologyTree): string {
  if (tree.empty || !tree.gateways.length) {
    return `<div class="empty-topo" role="status">
      <h3>Connect your first gateway</h3>
      <p class="sub" style="margin:0">No gateways are registered for this org yet.
      Join the mesh with an org-scoped gateway (<code>orgId</code> + heartbeat) or register via the gateway registry, then refresh.
      Topology is a pure read over the gateway registry, agent-instance registry, and celld — nothing is invented.</p>
    </div>`;
  }

  const items = tree.gateways
    .map((g: GatewayNode) => {
      const kindLabel = g.kind === "edge" ? "Edge" : "Regional Gateway";
      const title =
        g.kind === "edge"
          ? `${kindLabel}: ${g.ownerDeveloper ? `${g.ownerDeveloper}@` : ""}${g.meshIdentity}`
          : `${kindLabel}: ${g.meshIdentity}`;
      const kids =
        g.children.length === 0
          ? `<li class="meta-inline">No agents or cells attached</li>`
          : g.children
              .map(
                (a) => `<li>
            <span class="dot dot-${esc(a.status)}" title="${esc(a.status)}" aria-hidden="true"></span>
            <span class="kind">${esc(a.kind)}</span>
            <span>${esc(agentLabel(a))}</span>
            <span class="meta-inline">${esc(agentMeta(a))}</span>
            <a class="trace" href="${esc(a.traceLink)}" data-trace-src="${esc(a.traceLink)}" title="Compressed vs fat compare demo — not this agent's session (see #1082)">demo</a>
          </li>`
              )
              .join("");
      return `<li>
        <details>
          <summary>
            <span class="dot dot-${esc(g.status)}" title="${esc(g.status)}" aria-hidden="true"></span>
            <span>[${esc(title)}]</span>
            <span class="meta-inline">${esc(g.status)} · seen ${esc(relativeAgo(g.lastSeen))}</span>
          </summary>
          <ul class="children">${kids}</ul>
        </details>
      </li>`;
    })
    .join("");

  const srcNote = tree.sources.length
    ? `<p class="sub" style="margin-top:0.75rem">Sources: ${esc(tree.sources.join(", "))}</p>`
    : "";

  return `<ul class="topo">${items}</ul>${srcNote}`;
}

function renderCpcDashboardDoc(model: CpcDashboardModel): string {
  const { org, spend, actorTenantId } = model;
  const q = new URLSearchParams({
    orgId: org.orgId,
    tenant: actorTenantId,
  }).toString();
  const plan = org.planId ?? "team";
  const mode = org.billingMode ?? "—";
  const flash = model.flashSecret
    ? `<div class="flash" role="status">
        <strong>${esc(model.flashMessage ?? "New API key (shown once)")}</strong>
        <div><code>${esc(model.flashSecret)}</code></div>
        <p class="warn">Copy now — the secret is not stored in plaintext.</p>
      </div>`
    : model.flashMessage
      ? `<div class="flash"><strong>${esc(model.flashMessage)}</strong></div>`
      : "";

  const portalForm = model.portalAvailable
    ? `<form method="post" action="/credits/org/portal">
         <input type="hidden" name="orgId" value="${esc(org.orgId)}" />
         <input type="hidden" name="actorTenantId" value="${esc(actorTenantId)}" />
         <button class="btn" type="submit">Stripe Customer Portal</button>
       </form>`
    : `<span class="btn ghost" title="Link a Stripe customer on the org first">Portal unavailable</span>`;

  const memberRows = spend.members
    .slice(0, 20)
    .map(
      (m) => `<tr>
        <td class="mono">${esc(m.memberTenantId)}</td>
        <td>${esc(m.orgRole)}</td>
        <td>${dollars(m.balanceCents)}</td>
        <td>${dollars(m.spendableCents)}</td>
      </tr>`
    )
    .join("");

  const wormSpend = spend.wormSpend
    ? `<p class="sub">WORM payment spend groups: <strong>${spend.wormSpend.rows.length}</strong></p>`
    : "";

  const compareHref = (() => {
    const base = model.mcpUiTraceBase.replace(/\/$/, "");
    return base.endsWith("/trace") ? `${base}/compare` : `${base}/trace/compare`;
  })();

  const tracesHtml = (() => {
    const entries = model.wormEntries;
    const rows = entries
      .slice(0, 12)
      .map((e) => {
        const orgHint = e.payload.org_id ? ` · org ${e.payload.org_id}` : "";
        return `<tr>
        <td>${esc(e.ts.slice(0, 19).replace("T", " "))}</td>
        <td class="mono">${esc(e.action)}</td>
        <td>${esc(e.summary)}${esc(orgHint)}</td>
        <td class="mono">${esc(e.correlationId ?? "—")}</td>
      </tr>`;
      })
      .join("");
    const table = entries.length
      ? `<table>
        <thead><tr><th>When</th><th>Action</th><th>Summary</th><th>Correlation</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
      : `<p class="empty">No recent payment WORM entries.</p>`;
    return `
    <iframe class="trace-embed" id="trace-embed" title="Context flamegraph" src="${esc(compareHref)}" loading="lazy"></iframe>
    <div class="cta-row">
      <a class="btn ghost" href="${esc(compareHref)}" target="_blank" rel="noopener">Open flamegraph</a>
      <a class="btn ghost" href="${esc(model.mcpUiTraceBase)}/demo-compressed" target="_blank" rel="noopener">Demo compressed</a>
      <a class="btn ghost" href="/credits/activity?tenant=${encodeURIComponent(actorTenantId)}">Credits activity</a>
    </div>
    ${table}
    <p class="sub" style="margin-top:0.75rem">Embedded existing <code>/mcp-ui/trace/compare</code> compressed-vs-fat <strong>demo</strong> (not rebuilt; not per-agent — #1082). Topology <code>demo</code> links set the iframe source. WORM rows: payments audit trail.</p>`;
  })();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClawQL · ${esc(org.displayName || org.orgId)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${DASH_STYLES}</style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <h1 class="brand">Claw<span>QL</span></h1>
      <div class="meta">${esc(org.displayName || org.orgId)} · <code>${esc(org.orgId)}</code></div>
    </header>
    <p class="lede">Command center for your org — plan, keys, usage, topology, and traces. Same stores as CLI and CPC.</p>
    <nav class="nav" aria-label="Sections">
      <a href="#billing">Plan / billing</a>
      <a href="#keys">API keys</a>
      <a href="#usage">Usage</a>
      <a href="#topology">Topology</a>
      <a href="#traces">Traces</a>
      <a href="/credits?tenant=${encodeURIComponent(actorTenantId)}">Credits mini-UI</a>
    </nav>
    ${flash}

    <section class="panel" id="billing">
      <h2>Plan / billing</h2>
      <p class="sub">Upgrade, downgrade, and payment methods via Stripe Portal. Prepaid top-up stays on the credits rail.</p>
      <div class="grid">
        <div class="stat"><div class="label">Plan</div><div class="value">${esc(plan)}</div></div>
        <div class="stat"><div class="label">Billing mode</div><div class="value">${esc(String(mode))}</div></div>
        <div class="stat"><div class="label">Created via</div><div class="value">${esc(org.createdVia ?? "—")}</div></div>
        <div class="stat"><div class="label">Stripe customer</div><div class="value" style="font-size:1rem">${esc(org.stripeCustomerId ?? "—")}</div></div>
      </div>
      <div class="cta-row">
        ${portalForm}
        <a class="btn ghost" href="${esc(model.creditsTopupHref)}">Credit top-up</a>
      </div>
    </section>

    <section class="panel" id="keys">
      <h2>API keys</h2>
      <p class="sub">View active org keys and rotate (revoke + issue). Secrets are shown once.</p>
      ${renderKeysTable(model.keys, org.orgId, actorTenantId)}
      <div class="cta-row">
        <form method="post" action="/credits/org/keys/issue">
          <input type="hidden" name="orgId" value="${esc(org.orgId)}" />
          <input type="hidden" name="actorTenantId" value="${esc(actorTenantId)}" />
          <button class="btn" type="submit">Issue new key</button>
        </form>
      </div>
    </section>

    <section class="panel" id="usage">
      <h2>Usage</h2>
      <p class="sub">Reads <code>getOrgUnifiedSpendSummary</code> (not a fictional <code>computeCurrentSpend</code>).</p>
      <div class="grid">
        <div class="stat"><div class="label">Pool balance</div><div class="value">${dollars(spend.poolBalanceCents)}</div></div>
        <div class="stat"><div class="label">Member balances</div><div class="value">${dollars(spend.memberBalanceCents)}</div></div>
        <div class="stat"><div class="label">Total credits</div><div class="value">${dollars(spend.totalCreditsCents)}</div></div>
        <div class="stat"><div class="label">Active members</div><div class="value">${spend.members.length}</div></div>
      </div>
      ${wormSpend}
      ${
        memberRows
          ? `<table style="margin-top:0.75rem">
              <thead><tr><th>Member</th><th>Role</th><th>Balance</th><th>Spendable</th></tr></thead>
              <tbody>${memberRows}</tbody>
            </table>`
          : ""
      }
      <p class="sub" style="margin-top:0.75rem">Generated ${esc(spend.generatedAt)}</p>
    </section>

    <section class="panel" id="topology">
      <h2>Topology</h2>
      <p class="sub">One tree: regional and edge gateways share <code>GatewayNode</code>; persistent agents and celld cells share <code>AgentNode</code>. Collapsed by default — status dots stay visible.</p>
      ${renderTopology(model.topology)}
    </section>

    <section class="panel" id="traces">
      <h2>Traces</h2>
      <p class="sub">Embedded mcp-ui compressed-vs-fat <strong>demo</strong> flamegraph (existing surface — not per-agent session data; #1082). Topology <strong>demo</strong> links open it here.</p>
      ${tracesHtml}
    </section>

    <p class="foot">
      Org command center · <a href="/credits/org?${esc(q)}">Refresh</a>
      · Spec: customer-dashboard-full-scope-v0.1
    </p>
  </div>
  <script>
    (function () {
      var iframe = document.getElementById("trace-embed");
      if (!iframe) return;
      document.querySelectorAll("a.trace[data-trace-src]").forEach(function (a) {
        a.addEventListener("click", function (ev) {
          var src = a.getAttribute("data-trace-src");
          if (!src) return;
          ev.preventDefault();
          iframe.setAttribute("src", src);
          var traces = document.getElementById("traces");
          if (traces) traces.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    })();
  </script>
</body>
</html>`;
}

export const renderCpcDashboardHtml = (model: CpcDashboardModel): Effect.Effect<string> =>
  Effect.sync(() => renderCpcDashboardDoc(model));

export const renderCpcDashboardErrorHtml = (input: {
  title: string;
  message: string;
}): Effect.Effect<string> =>
  Effect.sync(
    () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(input.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
<style>${DASH_STYLES}</style></head>
<body><div class="shell">
  <h1 class="brand">Claw<span>QL</span></h1>
  <h2 class="page-title" style="font-family:Fraunces,serif">${esc(input.title)}</h2>
  <p class="lede">${esc(input.message)}</p>
  <div class="cta-row"><a class="btn" href="/credits">Credits home</a></div>
</div></body></html>`
  );
