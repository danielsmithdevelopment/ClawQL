/** MCP App HTML resources (`text/html;profile=mcp-app`). Self-contained — no remote scripts. */

export const MCP_APP_MIME = "text/html;profile=mcp-app";

export const UI_RESOURCE_URIS = {
  evidence: "ui://clawql/evidence",
  console: "ui://clawql/console",
} as const;

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; padding: 1rem 1.25rem; background: #0f1115; color: #e8eaed; }
  h1 { font-size: 1.1rem; margin: 0 0 0.75rem; }
  p, li { font-size: 0.9rem; line-height: 1.45; color: #c4c7cc; }
  .card { border: 1px solid #2a2f3a; border-radius: 8px; padding: 0.75rem 1rem; margin: 0.5rem 0; background: #161a22; }
  button { background: #a0e6ff; color: #0f1115; border: 0; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
${body}
<script>
/* MCP App host bridge — no remote scripts, no secrets */
window.addEventListener("message", (ev) => {
  if (!ev.data || typeof ev.data !== "object") return;
});
</script>
</body>
</html>`;
}

export function evidenceAppHtml(): string {
  return shell(
    "ClawQL Evidence",
    `<h1>Evidence</h1>
<p>This thread's ClawQL tool calls, gate decisions, redactions, mandates, and WORM entries.</p>
<div class="card" id="entries">Loading…</div>
<p><button type="button" id="verify">Verify chain</button></p>
<script>
document.getElementById("verify")?.addEventListener("click", () => {
  document.getElementById("entries").textContent = "Verify requested — host will call clawql_evidence.";
});
</script>`
  );
}

export function consoleAppHtml(): string {
  return shell(
    "ClawQL Console",
    `<h1>ClawQL Console</h1>
<p>Six-section dashboard scoped to your permissions.</p>
<ul>
  <li>Overview</li>
  <li>Memory</li>
  <li>Documents</li>
  <li>Activity</li>
  <li>Sources</li>
  <li>Admin (admin only)</li>
</ul>`
  );
}

export function readUiResource(uri: string): { mimeType: string; text: string } | null {
  if (uri === UI_RESOURCE_URIS.evidence) {
    return { mimeType: MCP_APP_MIME, text: evidenceAppHtml() };
  }
  if (uri === UI_RESOURCE_URIS.console) {
    return { mimeType: MCP_APP_MIME, text: consoleAppHtml() };
  }
  return null;
}
