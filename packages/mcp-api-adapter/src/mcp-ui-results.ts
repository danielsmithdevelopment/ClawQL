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

function pickHitArray(record: Record<string, unknown> | undefined): unknown[] {
  if (!record) return [];
  for (const key of ["hits", "results", "operations", "items"] as const) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

function normalizeSearchHit(row: unknown, index: number): {
  title: string;
  path: string;
  method: string;
  description: string;
  score: string;
  badge: string;
} {
  const r = asRecord(row) ?? {};
  const title = String(
    r.title ?? r.id ?? r.operationId ?? r.name ?? `Result ${index + 1}`
  );
  const path = String(r.path ?? r.url ?? r.href ?? "");
  const method = String(r.method ?? "");
  const description = String(r.snippet ?? r.description ?? r.summary ?? "");
  const score =
    r.score != null ? String(r.score) : r.rank != null ? String(r.rank) : "";
  const badge = String(r.specLabel ?? r.label ?? r.kind ?? r.source ?? "");
  return { title, path, method, description, score, badge };
}

/**
 * Card-grid search surface — intentionally not a docs-site layout.
 * Used for Core `search` and Agent Lab `docs_search` hits alike.
 */
function renderSearchResults(body: unknown): string {
  const record = asRecord(body);
  const rows = pickHitArray(record);
  if (rows.length === 0) {
    return `<p class="result-empty">No matching results.</p>
<details class="result-raw"><summary>Raw JSON</summary>${jsonFallback(body)}</details>`;
  }

  const query =
    record?.query != null ? String(record.query) : record?.q != null ? String(record.q) : "";
  const header = query
    ? `<p class="result-summary">Showing <strong>${rows.length}</strong> result${rows.length === 1 ? "" : "s"} for <code>${escapeMcpUiHtml(query)}</code></p>`
    : `<p class="result-summary"><strong>${rows.length}</strong> result${rows.length === 1 ? "" : "s"}</p>`;

  const cards = rows
    .map((row, index) => {
      const hit = normalizeSearchHit(row, index);
      const pills = [
        hit.method ? `<span class="pill pill--method">${escapeMcpUiHtml(hit.method)}</span>` : "",
        hit.badge ? `<span class="pill">${escapeMcpUiHtml(hit.badge)}</span>` : "",
        hit.score ? `<span class="pill pill--score">${escapeMcpUiHtml(hit.score)}</span>` : "",
      ]
        .filter(Boolean)
        .join("");
      return `<article class="result-card">
  <header class="result-card__header">
    <h3 class="result-card__title">${escapeMcpUiHtml(hit.title)}</h3>
    ${pills ? `<div class="result-card__pills">${pills}</div>` : ""}
  </header>
  ${hit.path ? `<p class="result-card__path"><code>${escapeMcpUiHtml(hit.path)}</code></p>` : ""}
  ${hit.description ? `<p class="result-card__snippet">${escapeMcpUiHtml(hit.description.slice(0, 220))}${hit.description.length > 220 ? "…" : ""}</p>` : ""}
</article>`;
    })
    .join("\n");

  return `${header}
<div class="result-grid" role="list">${cards}</div>
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
