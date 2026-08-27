#!/usr/bin/env node
/**
 * Generate self-contained HTML for docs.clawql.com /auth and /audit.
 * Content mirrors website/src/app/{auth,audit}/page.mdx (shipped on main).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CSS = `
:root {
  --bg: #f7f5f0;
  --bg-accent: #ebe6dc;
  --ink: #1a1a18;
  --muted: #5c5a54;
  --link: #0b5fff;
  --border: #d4cfc3;
  --code-bg: #efeae1;
  --table-head: #e4dfd4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121311;
    --bg-accent: #1c1d1a;
    --ink: #eceae4;
    --muted: #a8a59b;
    --link: #7eb0ff;
    --border: #2e2f2b;
    --code-bg: #22231f;
    --table-head: #262722;
  }
}
* { box-sizing: border-box; }
html { color-scheme: light dark; }
body {
  margin: 0;
  font-family: "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  background:
    radial-gradient(1200px 600px at 10% -10%, var(--bg-accent), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--link) 8%, transparent), transparent 50%),
    var(--bg);
  color: var(--ink);
  line-height: 1.65;
}
a { color: var(--link); text-underline-offset: 0.15em; }
header {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 0;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.875rem;
  color: var(--muted);
}
header a { color: inherit; text-decoration: none; }
header a:hover { color: var(--link); }
header nav { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
header .brand { font-weight: 600; color: var(--ink); letter-spacing: -0.02em; }
main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 4rem;
}
h1 {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: clamp(2rem, 4vw, 2.75rem);
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin: 0.5rem 0 1rem;
}
h2 {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
  margin: 2.25rem 0 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
h3 {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 1.05rem;
  margin: 1.5rem 0 0.5rem;
}
.lead { font-size: 1.125rem; color: var(--muted); }
.meta { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; font-size: 0.9rem; margin: 1rem 0 1.5rem; }
hr { border: 0; border-top: 1px solid var(--border); margin: 1.5rem 0; }
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 0.9rem 1rem;
  overflow-x: auto;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
}
code {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 0.1em 0.3em;
}
pre code { background: none; padding: 0; }
table {
  width: 100%;
  border-collapse: collapse;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.9rem;
  margin: 1rem 0;
}
th, td {
  text-align: left;
  vertical-align: top;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
}
th { background: var(--table-head); }
footer {
  max-width: 44rem;
  margin: 0 auto;
  padding: 0 1.25rem 3rem;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.85rem;
  color: var(--muted);
}
`.trim()

function page({ title, description, canonical, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ClawQL</title>
<meta name="description" content="${description.replace(/"/g, '&quot;')}" />
<link rel="canonical" href="${canonical}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<header>
  <nav>
    <a class="brand" href="https://docs.clawql.com/">ClawQL docs</a>
    <a href="/auth">Authentication</a>
    <a href="/audit">Audit Trail</a>
    <a href="https://clawql.com/">clawql.com</a>
  </nav>
</header>
<main>
${body}
</main>
<footer>
  <p>Package docs live in the repo under <code>packages/clawql-auth</code> and <code>packages/clawql-audit</code>. This page is served by a path-scoped Worker while the full OpenNext docs deploy is over the free-plan size limit.</p>
</footer>
</body>
</html>
`
}

const authBody = `
<h1>Authentication</h1>
<p class="lead">ClawQL handles two distinct authentication problems. <strong>Inbound</strong> is how clients and human operators authenticate to ClawQL's own MCP gateway. <strong>Outbound</strong> is how ClawQL authenticates to upstream services — Slack, Google, GitHub, and anything else an agent needs to call — on an agent's behalf. Most confusion about MCP auth comes from treating these as one problem. They are handled separately here.</p>
<p class="meta"><strong>Package:</strong> <a href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-auth">clawql-auth</a> · <a href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-auth/README.md">README</a> · <a href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-auth/src/oauth/token-store.ts">token store</a></p>
<p class="meta"><strong>Agent discovery:</strong> <a href="/auth.md"><code>/auth.md</code></a> is the machine-readable registration skill. This page is the human mechanism guide.</p>
<hr />
<h2>Outbound: token refresh</h2>
<p>The most common MCP auth complaint is a token that worked yesterday and doesn't today. This usually happens for one of two reasons: the token expired before anything tried to refresh it, or multiple concurrent sessions raced to refresh the same token and invalidated each other.</p>
<p>ClawQL's outbound token store addresses both directly.</p>
<p><strong>Refresh is proactive, not reactive.</strong> A token is refreshed once it comes within 60 seconds of expiry, not after a call fails with a 401. Nothing in a normal session should ever hit an expired token.</p>
<p><strong>Refresh is mutex-protected.</strong> When several concurrent agent sessions share a credential for the same provider, only one refresh runs at a time. Every other session waiting on that credential queues behind the in-flight refresh instead of calling the provider's token endpoint independently. This matters because most OAuth providers issue single-use refresh tokens — two simultaneous refresh attempts against the same refresh token typically means one succeeds and the other fails with <code>invalid_grant</code>, taking a session down for no reason other than timing. ClawQL's token store makes that race structurally impossible rather than relying on retry logic to paper over it.</p>
<pre><code>getValidToken(providerId, sessionId)
  → token still valid?          → return it
  → refresh already in flight?  → wait on that refresh, don't start another
  → otherwise                   → own the refresh, others queue behind it</code></pre>
<p><strong>Failure is explicit, not silent.</strong> If a refresh token is dead (<code>invalid_grant</code>), the credential is marked as requiring re-authorization and the calling session receives a typed error rather than a generic failure. This is a real state change a human needs to act on — a stale credential doesn't quietly keep retrying in the background.</p>
<p>This covers any provider ClawQL calls on an agent's behalf: Google, Microsoft, Slack, GitHub, and others. All of it applies whether ClawQL is calling one provider from one session or many sessions calling many providers concurrently.</p>
<h2>Inbound: connecting to ClawQL itself</h2>
<p>Inbound authentication is how something connects to ClawQL's MCP gateway — a human operator, a CI pipeline, or a client like Claude Desktop, Cursor, or Cline.</p>
<h3>API keys</h3>
<p>The default for programmatic and machine-to-machine access. Issued keys (<code>cqk_…</code>) are hashed on storage, validated with a constant-time comparison, and scoped — a key can be limited to specific tools and a specific owner (a single developer, a team, or an organization). Keys are revocable; optional expiry is set at issue time.</p>
<h3>Enterprise-Managed Authorization (EMA)</h3>
<p>ClawQL implements the open ID-JAG (Identity Assertion JWT Authorization Grant) extension to OAuth — the same mechanism behind Claude's, VS Code's, and other MCP hosts' Enterprise-Managed Authorization. This is not a proprietary integration; it's an open, IETF-track specification that any identity provider or MCP server can implement.</p>
<p>ClawQL supports both roles independently:</p>
<p><strong>As a Resource App Authorization Server (consumer role).</strong> An enterprise's identity provider — Okta today, others as they add support — mints an ID-JAG assertion when an employee logs in. ClawQL verifies that assertion against the org's JWKS, maps the employee's IdP groups to a scoped access token, and the employee gets access with no individual OAuth consent screen. This is the standard EMA flow: the org's existing IdP stays the source of truth, ClawQL is the connector accepting its assertions.</p>
<p><strong>As an Enterprise Identity Provider (issuer role).</strong> ClawQL can also mint ID-JAG assertions itself, for organizations that want zero-touch provisioning without routing session-token custody through a third-party identity SaaS. In this mode, ClawQL is the org's IdP for the purposes of MCP connector access — any EMA-compliant connector, not just ClawQL's own, can accept assertions ClawQL issues.</p>
<p>An organization can run either role alone or both simultaneously, with no third-party identity provider involved in the AI/MCP path at all.</p>
<h3>What EMA does not cover</h3>
<p>ID-JAG assumes the underlying enterprise SSO already produced a standard identity assertion by the time it reaches an MCP connector. If an organization's internal SSO is SAML rather than OIDC, that exchange — SAML assertion to OAuth token to ID-JAG — happens entirely on the identity provider's side, before anything reaches ClawQL. ClawQL does not implement a SAML server itself; this is a deliberate scope boundary, not a missing feature.</p>
<h3>Session tokens</h3>
<p>Once a client is authenticated by any of the above methods, it holds a short-lived session JWT (MCP OAuth access tokens default to <strong>5 minutes</strong>; refresh tokens default to <strong>1 hour</strong> — both configurable) carrying the scope it's authorized for — which tools it can call, what budget it has, how long the session lasts. This token is what gets checked on every subsequent tool call, not the original credential.</p>
<h2>Signing</h2>
<p>Production deployments sign tokens with RS256 and publish a JWKS endpoint, so a resource server can verify tokens without holding the signing key. A development-only HS256 fallback exists for local testing and is not intended for production use; ClawQL warns at startup if a production-shaped deployment is running on the development signing path.</p>
<p>Where ClawQL acts as both a Resource App Authorization Server and an Enterprise Identity Provider in the same deployment, each role should use its own signing key. Sharing one key between the two roles is supported for convenience but means a compromise of either role compromises both; ClawQL warns at startup when this configuration is in use.</p>
<h2>Audit</h2>
<p>Every authentication event — a token issued, a token refused, a refresh that succeeded or failed, a re-authorization requested — is emitted through ClawQL's auth event sink into the append-only audit trail when a host has wired one (for example process WORM via <code>clawql-audit</code>). See <a href="/audit"><strong>Audit Trail</strong></a> for how that trail is structured and verified.</p>
<h2>Summary</h2>
<table>
<thead><tr><th>Problem</th><th>Mechanism</th></tr></thead>
<tbody>
<tr><td>Outbound token expired overnight</td><td>Proactive refresh, 60 seconds before expiry</td></tr>
<tr><td>Concurrent sessions invalidating each other's refresh token</td><td>Mutex — one refresh per provider, others queue</td></tr>
<tr><td>Per-user OAuth consent screens at enterprise scale</td><td>EMA / ID-JAG, consumer role</td></tr>
<tr><td>Third-party identity provider holding session-token custody</td><td>EMA / ID-JAG, issuer role — ClawQL as the IdP</td></tr>
<tr><td>Legacy SAML-based internal SSO</td><td>Out of scope — handled upstream by the org's IdP before reaching ClawQL</td></tr>
<tr><td>Verifying who did what, when</td><td>Every auth event in the audit trail</td></tr>
</tbody>
</table>
`.trim()

const auditBody = `
<h1>Audit Trail</h1>
<p class="lead">Every consequential action ClawQL takes — a tool call, an authentication event, a scope denial, a document extraction, a payment, a model inference — is written to an append-only audit trail before that action is considered complete. This is not a logging feature added for compliance checkboxes. It's the mechanism that makes every other claim ClawQL makes about an agent's behavior checkable after the fact, rather than merely asserted at the time.</p>
<p class="meta"><strong>Package:</strong> <a href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-audit">clawql-audit</a> · <a href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-audit/README.md">README</a> · companion <a href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-merkle">clawql-merkle</a></p>
<p class="meta"><strong>Related:</strong> <a href="/auth">Authentication</a> (auth events dual-write into this trail) · <a href="/learn/audit-tool-and-observability">Audit tool &amp; observability</a> (in-process MCP <code>audit</code> ring buffer — different surface)</p>
<hr />
<h2>What gets recorded</h2>
<p>Anything with a consequence gets an entry: which tool was called, with what arguments, by which session, at what time, and what happened as a result. This includes actions that don't involve a model call at all — a scheduled job firing, a file write, a credential refresh, a scope enforcement decision blocking a request. If an action changed something or was denied, it's in the trail.</p>
<p>Entries carry enough context to answer, after the fact: what was this session authorized to do, what did it actually do, and did those match.</p>
<h2>How integrity is guaranteed</h2>
<p>Two distinct mechanisms are used here, deliberately kept separate because they prove two different things.</p>
<p><strong>A hash chain proves the log itself hasn't been tampered with.</strong> Every entry embeds the hash of the entry before it. If any entry is altered, deleted, or reordered after the fact, recomputing the chain from any earlier known-good point immediately reveals it. This is what makes the trail append-only in practice, not just by policy — modifying history breaks verifiably.</p>
<p><strong>A Merkle root, computed periodically over a batch of entries, proves a specific entry belongs to a specific batch without needing the whole batch to check it.</strong> This is what makes external verification cheap: rather than handing someone your entire log to confirm one entry, you hand them the entry and a short proof, and they can confirm it against a root that's been published independently of you.</p>
<p>These aren't the same thing solving the same problem twice. The hash chain protects the log's internal order over time. The Merkle root is what makes a single entry externally checkable without trusting whoever operates the log.</p>
<h2>Replication</h2>
<p>An entry is written locally and queued for remote replication in the same operation — not written locally and then separately, optionally, sent elsewhere. A background process drains that queue to remote storage. If the remote write is delayed, the entry that produced it is already durable locally (with an outbox record); nothing is lost, and callers are not failed solely because remote is temporarily down.</p>
<p>On restart, the outbox drains and the trail's current position is loaded from durable storage before anything new is accepted. A process that restarted with no memory of where the log left off would risk starting a second, conflicting sequence — this is checked for explicitly rather than assumed away.</p>
<h2>External verification</h2>
<p>Because the trail is Merkle-batched, its integrity doesn't depend on trusting the operator. A batch root can be published somewhere outside ClawQL's own infrastructure — anchored across multiple public chains chosen for stability and low cost rather than any single one — so that a specific entry's existence at a specific time is checkable by anyone, using only that entry and a short proof, against a root they didn't get from ClawQL.</p>
<p>ClawQL computes and exposes those batch roots as the handoff for that external anchoring. Publishing a root onto public chains is an operator / integrator step on top of the trail (not a single hard-wired vendor chain).</p>
<p>This matters for exactly the situations where "trust our logs" isn't good enough: an audit by a party that doesn't want to rely on the vendor's word, a dispute where both sides need to agree on what happened, a regulatory requirement that records be tamper-evident independent of who's holding them.</p>
<h2>What this enables</h2>
<p><strong>Incident review.</strong> If an agent did something unexpected, the trail shows exactly what it was authorized to do, what it attempted, and where enforcement did or didn't intervene — not a reconstruction from memory or logs that could have been edited after the fact.</p>
<p><strong>Scope enforcement is itself audited.</strong> When a tool call is blocked because it falls outside a session's authorized scope, that denial is recorded with the same rigor as anything that succeeds. A pattern of denials against one session or one credential is visible, not silent.</p>
<p><strong>Correlated chains across systems.</strong> Where one action leads to another — an identity assertion issued, then exchanged for an access token, then used to call a tool — each step's entry carries a reference to the step before it, so the full sequence can be reconstructed from any point in it, not just inferred from timestamps.</p>
<p><strong>Standalone use.</strong> The audit trail has no dependency on the rest of ClawQL's stack. It can be adopted on its own, in front of any agent framework, by a team that wants tamper-evident logging without adopting anything else ClawQL does.</p>
<h2>Summary</h2>
<table>
<thead><tr><th>Property</th><th>Mechanism</th></tr></thead>
<tbody>
<tr><td>Log can't be silently altered</td><td>Hash chain — every entry references the one before it</td></tr>
<tr><td>One entry verifiable without the whole log</td><td>Merkle batch root + short inclusion proof</td></tr>
<tr><td>No entry lost between local write and remote copy</td><td>Local write and replication outbox in one operation</td></tr>
<tr><td>Restart can't fork the sequence</td><td>Chain position / outbox loaded from durable storage before accepting new entries</td></tr>
<tr><td>Verifiable without trusting the operator</td><td>Batch roots computed for external anchoring (multi-location publish)</td></tr>
<tr><td>Works without the rest of ClawQL</td><td>No dependency on other ClawQL components</td></tr>
</tbody>
</table>
`.trim()

const pages = [
  {
    file: 'public/auth/index.html',
    title: 'Authentication',
    description:
      'ClawQL inbound and outbound auth: proactive OAuth refresh with a mutex, API keys, EMA / ID-JAG, signing, and audit.',
    canonical: 'https://docs.clawql.com/auth',
    body: authBody,
  },
  {
    file: 'public/audit/index.html',
    title: 'Audit Trail',
    description:
      'ClawQL append-only audit trail: hash chain integrity, Merkle batch verification, dual-ack replication, and external anchoring.',
    canonical: 'https://docs.clawql.com/audit',
    body: auditBody,
  },
]

for (const p of pages) {
  const out = join(root, p.file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, page(p), 'utf8')
  console.log('wrote', p.file)
}
