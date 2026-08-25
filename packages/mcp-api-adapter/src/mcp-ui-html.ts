import type { ListedMcpTool } from "mcp-grpc-transport";
import { escapeMcpUiHtml, renderToolFormFields } from "./mcp-ui-form.js";

const MCP_UI_STYLES = `
  :root {
    color-scheme: light;
    --ink: #0f172a;
    --muted: #475569;
    --line: rgba(15, 23, 42, 0.12);
    --surface: #ffffff;
    --accent: #0d6e62;
    --accent-soft: #dff3ec;
    --ok: #166534;
    --ok-bg: #ecfdf5;
    --err: #991b1b;
    --err-bg: #fef2f2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(900px 420px at 0% 0%, #cfe8e0 0%, transparent 55%),
      radial-gradient(700px 380px at 100% 0%, #dbeafe 0%, transparent 50%),
      #f8fafc;
    line-height: 1.45;
  }
  .page {
    max-width: 72rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }
  .hero {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.5rem;
    align-items: end;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }
  .hero h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    letter-spacing: -0.03em;
  }
  .hero p {
    margin: 0.35rem 0 0;
    color: var(--muted);
    max-width: 42rem;
  }
  .meta {
    font-size: 0.85rem;
    color: var(--muted);
    text-align: right;
  }
  .nav-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .nav-links a {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.92rem;
  }
  .nav-links a:hover { text-decoration: underline; }
  .tool-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
  }
  .tool-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .tool-card h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
  }
  .tool-card .tool-name {
    margin: 0.25rem 0 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .tool-card .tool-desc {
    margin: 0 0 0.85rem;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .field {
    display: block;
    margin-bottom: 0.75rem;
  }
  .field-label {
    display: block;
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .field input,
  .field select,
  .field textarea {
    width: 100%;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font: inherit;
    background: #fff;
  }
  .field textarea { resize: vertical; min-height: 5rem; }
  .field--checkbox {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
  }
  .field--checkbox input { width: auto; margin-top: 0.2rem; }
  .field-help {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .submit {
    appearance: none;
    border: 0;
    border-radius: 8px;
    padding: 0.55rem 0.85rem;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .submit:hover { filter: brightness(1.05); }
  .htmx-indicator { opacity: 0; margin-left: 0.35rem; }
  .htmx-request .htmx-indicator { opacity: 1; }
  .result-pane { margin-top: 0.85rem; }
  .result {
    border-radius: 10px;
    padding: 0.75rem;
    font-size: 0.9rem;
  }
  .result--success {
    background: var(--ok-bg);
    border: 1px solid rgba(22, 101, 52, 0.18);
  }
  .result--error {
    background: var(--err-bg);
    border: 1px solid rgba(153, 27, 27, 0.18);
    color: var(--err);
  }
  .result__header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    margin-bottom: 0.5rem;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .result__tool {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--ink);
  }
  .result pre {
    margin: 0;
    overflow: auto;
    max-height: 18rem;
    padding: 0.65rem;
    background: rgba(15, 23, 42, 0.04);
    border-radius: 8px;
    font-size: 0.82rem;
  }
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
    background: var(--surface);
    border: 1px dashed var(--line);
    border-radius: 12px;
  }
`;

function renderToolCard(tool: ListedMcpTool, basePath: string): string {
  const { html: fieldsHtml } = renderToolFormFields(tool);
  const title = tool.title?.trim() || tool.description?.trim() || tool.name;
  const description =
    tool.description && tool.description !== title
      ? `<p class="tool-desc">${escapeMcpUiHtml(tool.description)}</p>`
      : "";

  return `<article class="tool-card" id="tool-${escapeMcpUiHtml(tool.name)}">
  <h2>${escapeMcpUiHtml(title)}</h2>
  <p class="tool-name">${escapeMcpUiHtml(tool.name)}</p>
  ${description}
  <form
    hx-post="${escapeMcpUiHtml(basePath)}/execute/${escapeMcpUiHtml(tool.name)}"
    hx-target="#result-${escapeMcpUiHtml(tool.name)}"
    hx-swap="innerHTML"
    hx-indicator="#spinner-${escapeMcpUiHtml(tool.name)}"
  >
    ${fieldsHtml}
    <button type="submit" class="submit">
      Run ${escapeMcpUiHtml(tool.name)}
      <span id="spinner-${escapeMcpUiHtml(tool.name)}" class="htmx-indicator">…</span>
    </button>
  </form>
  <div id="result-${escapeMcpUiHtml(tool.name)}" class="result-pane"></div>
</article>`;
}

export function renderMcpUiCatalogPage(options: {
  title: string;
  tools: ListedMcpTool[];
  fetchedAt: string;
  upstream: string;
  basePath?: string;
}): string {
  const basePath = options.basePath?.replace(/\/$/, "") || "/mcp-ui";
  const safeTitle = escapeMcpUiHtml(options.title);
  const cards =
    options.tools.length > 0
      ? options.tools.map((tool) => renderToolCard(tool, basePath)).join("\n")
      : `<div class="empty">No tools in catalog.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} — MCP UI</title>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"></script>
  <style>${MCP_UI_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div>
        <h1>${safeTitle}</h1>
        <p>Swagger UI for MCP — auto-generated forms from the live tool catalog. Submit to run tools inline.</p>
      </div>
      <div class="meta">
        <div>${options.tools.length} tool${options.tools.length === 1 ? "" : "s"}</div>
        <div>Updated ${escapeMcpUiHtml(new Date(options.fetchedAt).toLocaleString())}</div>
        <div>${escapeMcpUiHtml(options.upstream)}</div>
      </div>
    </header>
    <nav class="nav-links">
      <a href="/docs">OpenAPI /docs</a>
      <a href="/graphiql">GraphiQL</a>
      <a href="/tools">Tool catalog JSON</a>
    </nav>
    <main class="tool-grid">${cards}</main>
  </div>
</body>
</html>`;
}

export function renderMcpUiSuccessResult(options: {
  toolName: string;
  executionMs: number;
  body: unknown;
}): string {
  const formatted = JSON.stringify(options.body, null, 2);
  return `<div class="result result--success">
  <header class="result__header">
    <span class="result__tool">${escapeMcpUiHtml(options.toolName)}</span>
    <span class="result__time">${options.executionMs}ms</span>
    <span class="result__timestamp">${escapeMcpUiHtml(new Date().toISOString())}</span>
  </header>
  <div class="result__content">
    <pre><code>${escapeMcpUiHtml(formatted)}</code></pre>
  </div>
</div>`;
}

export function renderMcpUiErrorResult(options: {
  toolName: string;
  message: string;
  details?: string;
}): string {
  const details = options.details
    ? `<pre>${escapeMcpUiHtml(options.details)}</pre>`
    : "";
  return `<div class="result result--error">
  <p><strong>${escapeMcpUiHtml(options.toolName)}</strong> — ${escapeMcpUiHtml(options.message)}</p>
  ${details}
</div>`;
}
