import { escapeMcpUiHtml } from "./mcp-ui-form.js";
import type { McpUiResultKind } from "./mcp-ui-templates.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonFallback(body: unknown): string {
  return `<pre><code>${escapeMcpUiHtml(JSON.stringify(body, null, 2))}</code></pre>`;
}

function renderSearchResults(body: unknown): string {
  const record = asRecord(body);
  const results = asArray(record?.results);
  if (results.length === 0) {
    return `<p class="result-empty">No matching operations.</p>${jsonFallback(body)}`;
  }
  const items = results
    .map((row) => {
      const r = asRecord(row) ?? {};
      const id = String(r.id ?? r.operationId ?? "operation");
      const method = r.method != null ? String(r.method) : "";
      const path = r.path != null ? String(r.path) : "";
      const description = r.description != null ? String(r.description) : "";
      const score = r.score != null ? String(r.score) : "";
      const label = r.specLabel != null ? String(r.specLabel) : "";
      return `<li class="result-item">
  <div class="result-item__title"><code>${escapeMcpUiHtml(id)}</code>${label ? ` <span class="pill">${escapeMcpUiHtml(label)}</span>` : ""}</div>
  <div class="result-item__meta">${escapeMcpUiHtml([method, path].filter(Boolean).join(" "))} ${score ? `· score ${escapeMcpUiHtml(score)}` : ""}</div>
  ${description ? `<p class="result-item__desc">${escapeMcpUiHtml(description)}</p>` : ""}
</li>`;
    })
    .join("\n");
  return `<ol class="result-list">${items}</ol>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
}

function renderMemoryResults(body: unknown): string {
  const record = asRecord(body);
  if (!record) return jsonFallback(body);

  if (record.ok === true && record.path != null) {
    return `<p class="result-summary">Saved <code>${escapeMcpUiHtml(String(record.path))}</code>${
      record.wormRef ? ` · WORM <code>${escapeMcpUiHtml(String(record.wormRef))}</code>` : ""
    }</p>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
  }

  const results = asArray(record.results);
  if (results.length === 0) {
    return `<p class="result-empty">No vault hits for this query.</p>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
  }

  const items = results
    .map((row) => {
      const r = asRecord(row) ?? {};
      const path = String(r.path ?? r.id ?? "note");
      const score = r.score != null ? Number(r.score).toFixed(1) : "";
      const snippet = r.snippet != null ? String(r.snippet) : "";
      return `<li class="result-item">
  <div class="result-item__title"><code>${escapeMcpUiHtml(path)}</code>${score ? ` <span class="pill">score ${escapeMcpUiHtml(score)}</span>` : ""}</div>
  ${snippet ? `<p class="result-item__desc">${escapeMcpUiHtml(snippet.slice(0, 280))}${snippet.length > 280 ? "…" : ""}</p>` : ""}
</li>`;
    })
    .join("\n");

  return `<ol class="result-list">${items}</ol>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
}

function renderCacheResults(body: unknown): string {
  const record = asRecord(body);
  if (!record) return jsonFallback(body);
  const op = record.operation != null ? String(record.operation) : "";
  const summaryBits = [
    op ? `operation <code>${escapeMcpUiHtml(op)}</code>` : null,
    record.count != null ? `count ${escapeMcpUiHtml(String(record.count))}` : null,
    record.key != null ? `key <code>${escapeMcpUiHtml(String(record.key))}</code>` : null,
  ].filter(Boolean);
  const keys = asArray(record.keys)
    .map((k) => `<li><code>${escapeMcpUiHtml(String(k))}</code></li>`)
    .join("");
  return `<p class="result-summary">${summaryBits.join(" · ") || "Cache result"}</p>
${keys ? `<ul class="result-list result-list--compact">${keys}</ul>` : ""}
${record.value != null ? `<pre><code>${escapeMcpUiHtml(String(record.value))}</code></pre>` : ""}
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
}

function renderAuditResults(body: unknown): string {
  const record = asRecord(body);
  if (!record) return jsonFallback(body);
  const events = asArray(record.events ?? record.entries ?? record.items);
  if (events.length === 0) {
    return `<p class="result-summary">${escapeMcpUiHtml(
      record.ok === true ? "Audit operation succeeded." : "No audit events."
    )}</p>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
  }
  const items = events
    .slice(0, 30)
    .map((row) => {
      const r = asRecord(row) ?? { value: row };
      const line = JSON.stringify(r);
      return `<li class="result-item"><code>${escapeMcpUiHtml(line.slice(0, 240))}${line.length > 240 ? "…" : ""}</code></li>`;
    })
    .join("\n");
  return `<ol class="result-list">${items}</ol>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
}

export function renderResultContent(kind: McpUiResultKind, body: unknown): string {
  switch (kind) {
    case "search":
      return renderSearchResults(body);
    case "memory":
      return renderMemoryResults(body);
    case "cache":
      return renderCacheResults(body);
    case "audit":
      return renderAuditResults(body);
    default:
      return jsonFallback(body);
  }
}
