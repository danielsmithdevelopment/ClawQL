import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  escapeMcpUiHtml,
  renderToolFormFields,
  type FormFieldError,
} from "./mcp-ui-form.js";
import { renderResultContent } from "./mcp-ui-results.js";
import { formHintsForTool, resultKindForTool, resolveMcpUiTemplate } from "./mcp-ui-templates.js";

const MCP_UI_STYLES = `
  :root {
    color-scheme: light;
    --ink: #0f172a;
    --muted: #475569;
    --line: rgba(15, 23, 42, 0.12);
    --surface: #ffffff;
    --accent: #0d6e62;
    --ok: #166534;
    --ok-bg: #ecfdf5;
    --err: #991b1b;
    --err-bg: #fef2f2;
    --warn: #92400e;
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
    margin: 0.25rem 0 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .tool-card .tool-desc {
    margin: 0 0 0.85rem;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .template-pill {
    display: inline-block;
    margin: 0 0 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: rgba(13, 110, 98, 0.1);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .field {
    display: block;
    margin-bottom: 0.75rem;
  }
  .field-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .badge {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0.12rem 0.4rem;
    border-radius: 999px;
  }
  .badge--required {
    background: rgba(153, 27, 27, 0.1);
    color: var(--err);
  }
  .badge--optional {
    background: rgba(71, 85, 105, 0.12);
    color: var(--muted);
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
  .field--error input,
  .field--error select,
  .field--error textarea {
    border-color: rgba(153, 27, 27, 0.55);
    background: #fff7f7;
  }
  .field-help {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .field-error {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--err);
    font-weight: 600;
  }
  .advanced {
    margin: 0.5rem 0 0.85rem;
    border: 1px dashed var(--line);
    border-radius: 10px;
    padding: 0.35rem 0.65rem 0.65rem;
    background: rgba(248, 250, 252, 0.8);
  }
  .advanced summary {
    cursor: pointer;
    font-weight: 650;
    font-size: 0.88rem;
    color: var(--muted);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0;
  }
  .advanced summary::-webkit-details-marker { display: none; }
  .advanced__body { margin-top: 0.35rem; }
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
  .result-list {
    margin: 0;
    padding-left: 1.15rem;
    display: grid;
    gap: 0.55rem;
  }
  .result-list--compact { padding-left: 1rem; }
  .result-item__title {
    font-weight: 650;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }
  .result-item__meta {
    font-size: 0.78rem;
    color: var(--muted);
  }
  .result-item__desc {
    margin: 0.2rem 0 0;
    font-size: 0.84rem;
    color: var(--ink);
  }
  .result-summary { margin: 0 0 0.5rem; }
  .result-empty { margin: 0 0 0.5rem; color: var(--muted); }
  .result-raw { margin-top: 0.65rem; font-size: 0.82rem; color: var(--muted); }
  .result-raw summary { cursor: pointer; }
  .pill {
    display: inline-block;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.06);
    font-size: 0.72rem;
    color: var(--muted);
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

function renderToolCard(
  tool: ListedMcpTool,
  basePath: string,
  fieldErrors?: Record<string, string>
): string {
  const hints = formHintsForTool(tool, fieldErrors);
  const { html: fieldsHtml } = renderToolFormFields(tool, hints);
  const template = resolveMcpUiTemplate(tool);
  const title = tool.title?.trim() || tool.description?.trim() || tool.name;
  const description =
    tool.description && tool.description !== title
      ? `<p class="tool-desc">${escapeMcpUiHtml(tool.description)}</p>`
      : "";
  const templatePill = template
    ? `<span class="template-pill">Template · ${escapeMcpUiHtml(template.id)}</span>`
    : "";

  return `<article class="tool-card" id="tool-${escapeMcpUiHtml(tool.name)}">
  <h2>${escapeMcpUiHtml(title)}</h2>
  <p class="tool-name">${escapeMcpUiHtml(tool.name)}</p>
  ${templatePill}
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
  <meta name="htmx-config" content='{"responseHandling":[{"code":".*", "swap": true}]}' />
  <style>${MCP_UI_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div>
        <h1>${safeTitle}</h1>
        <p>Swagger UI for MCP — auto-generated forms from the live tool catalog. Required fields are marked; advanced options stay collapsed.</p>
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
  const content = renderResultContent(resultKindForTool(options.toolName), options.body);
  return `<div class="result result--success">
  <header class="result__header">
    <span class="result__tool">${escapeMcpUiHtml(options.toolName)}</span>
    <span class="result__time">${options.executionMs}ms</span>
    <span class="result__timestamp">${escapeMcpUiHtml(new Date().toISOString())}</span>
  </header>
  <div class="result__content">${content}</div>
</div>`;
}

export function renderMcpUiErrorResult(options: {
  toolName: string;
  message: string;
  details?: string;
  fieldErrors?: FormFieldError[];
}): string {
  const fieldList =
    options.fieldErrors && options.fieldErrors.length > 0
      ? `<ul class="result-list result-list--compact">${options.fieldErrors
          .map(
            (e) =>
              `<li>${e.field ? `<code>${escapeMcpUiHtml(e.field)}</code> — ` : ""}${escapeMcpUiHtml(e.message)}</li>`
          )
          .join("")}</ul>`
      : "";
  const details = options.details
    ? `<pre>${escapeMcpUiHtml(options.details)}</pre>`
    : "";
  return `<div class="result result--error">
  <p><strong>${escapeMcpUiHtml(options.toolName)}</strong> — ${escapeMcpUiHtml(options.message)}</p>
  ${fieldList}
  ${details}
</div>`;
}
