import { escapeMcpUiHtml } from "./mcp-ui-form.js";
import type { McpUiResultKind } from "./mcp-ui-templates/index.js";

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

const SAFE_TOOL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_FIELD = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HTTPS_IMG = /^https:\/\/[^\s"'<>]+$/i;
const HTTPS_HREF = /^https:\/\/[^\s"'<>]+$/i;
const MCP_UI_EXECUTE_PREFIX = "/mcp-ui/execute";

type McpUiCardAction = {
  label: string;
  tool: string;
  fields: Record<string, string>;
};

type McpUiCard = {
  title: string;
  subtitle?: string;
  body?: string;
  href?: string;
  linkLabel?: string;
  image?: string;
  pills: string[];
  actions: McpUiCardAction[];
};

type McpUiCardsDoc = {
  summary?: string;
  groups: Array<{ title: string; items: McpUiCard[] }>;
};

function parseCardsDoc(body: unknown): McpUiCardsDoc | undefined {
  const record = asRecord(body);
  if (!record || record.mcpUi !== "cards") return undefined;

  const parseCard = (raw: unknown): McpUiCard | undefined => {
    const r = asRecord(raw);
    if (!r) return undefined;
    const title = String(r.title ?? "").trim();
    if (!title) return undefined;
    const pills = asArray(r.pills)
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 12);
    const actions: McpUiCardAction[] = [];
    for (const actionRaw of asArray(r.actions).slice(0, 4)) {
      const a = asRecord(actionRaw);
      if (!a) continue;
      const tool = String(a.tool ?? "").trim();
      const label = String(a.label ?? "").trim();
      if (!SAFE_TOOL.test(tool) || !label) continue;
      const fields: Record<string, string> = {};
      const fieldSrc = asRecord(a.fields) ?? {};
      for (const [k, v] of Object.entries(fieldSrc)) {
        if (!SAFE_FIELD.test(k)) continue;
        fields[k] = String(v);
      }
      actions.push({ label, tool, fields });
    }
    const image = typeof r.image === "string" && HTTPS_IMG.test(r.image) ? r.image : undefined;
    const href = typeof r.href === "string" && HTTPS_HREF.test(r.href) ? r.href : undefined;
    const subtitle = r.subtitle != null ? String(r.subtitle).trim() : "";
    const text = r.body != null ? String(r.body).trim() : "";
    const linkLabel = r.linkLabel != null ? String(r.linkLabel).trim() : "";
    return {
      title,
      subtitle: subtitle || undefined,
      body: text || undefined,
      href,
      linkLabel: linkLabel || undefined,
      image,
      pills,
      actions,
    };
  };

  const groups: McpUiCardsDoc["groups"] = [];
  const grouped = asArray(record.groups);
  if (grouped.length > 0) {
    for (const g of grouped) {
      const row = asRecord(g);
      if (!row) continue;
      const title = String(row.title ?? "").trim() || "Meals";
      const items = asArray(row.items)
        .map(parseCard)
        .filter((c): c is McpUiCard => c != null);
      if (items.length) groups.push({ title, items });
    }
  } else {
    const items = asArray(record.items)
      .map(parseCard)
      .filter((c): c is McpUiCard => c != null);
    if (items.length) groups.push({ title: "Meals", items });
  }
  if (groups.length === 0) return undefined;
  const summary = record.summary != null ? String(record.summary).trim() : "";
  return { summary: summary || undefined, groups };
}

function renderCardAction(action: McpUiCardAction, statusId: string): string {
  const inputs = Object.entries(action.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeMcpUiHtml(name)}" value="${escapeMcpUiHtml(value)}" />`
    )
    .join("");
  return `<form
    class="result-card__action"
    hx-post="${escapeMcpUiHtml(`${MCP_UI_EXECUTE_PREFIX}/${action.tool}`)}"
    hx-target="#${escapeMcpUiHtml(statusId)}"
    hx-swap="innerHTML"
  >
    ${inputs}
    <button type="submit">${escapeMcpUiHtml(action.label)}</button>
  </form>`;
}

function renderMealCard(card: McpUiCard, statusId: string): string {
  const pills = card.pills
    .map((p) => `<span class="pill">${escapeMcpUiHtml(p)}</span>`)
    .join("");
  const img = card.image
    ? `<img class="result-card__image" src="${escapeMcpUiHtml(card.image)}" alt="" />`
    : "";
  const sub = card.subtitle
    ? `<p class="result-card__path">${escapeMcpUiHtml(card.subtitle)}</p>`
    : "";
  const snippet = card.body
    ? `<p class="result-card__snippet">${escapeMcpUiHtml(card.body)}</p>`
    : "";
  const link =
    card.href && card.linkLabel
      ? `<p class="result-card__path"><a href="${escapeMcpUiHtml(card.href)}" target="_blank" rel="noopener noreferrer">${escapeMcpUiHtml(card.linkLabel)}</a></p>`
      : "";
  const actions = card.actions.map((a) => renderCardAction(a, statusId)).join("");
  return `<article class="result-card">
  ${img}
  <header class="result-card__header">
    <h3 class="result-card__title">${escapeMcpUiHtml(card.title)}</h3>
    ${pills ? `<div class="result-card__pills">${pills}</div>` : ""}
  </header>
  ${sub}
  ${snippet}
  ${link}
  ${actions ? `<div class="result-card__actions">${actions}<div id="${escapeMcpUiHtml(statusId)}" class="result-card__status"></div></div>` : ""}
</article>`;
}

function renderMcpUiCards(doc: McpUiCardsDoc): string {
  const shown = doc.groups.reduce((n, g) => n + g.items.length, 0);
  const header = doc.summary
    ? `<p class="result-summary">${escapeMcpUiHtml(doc.summary)}</p>`
    : `<p class="result-summary"><strong>${shown}</strong> meal${shown === 1 ? "" : "s"}</p>`;
  const sections = doc.groups
    .map((group, gi) => {
      const cards = group.items
        .map((card, ci) => renderMealCard(card, `cart-status-${gi}-${ci}`))
        .join("\n");
      return `<section class="result-group">
  <h3 class="result-group__title">${escapeMcpUiHtml(group.title)}</h3>
  <div class="result-grid result-grid--meals" role="list">${cards}</div>
</section>`;
    })
    .join("\n");
  return `${header}
${sections}`;
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
  const cards = parseCardsDoc(body);
  if (cards) return renderMcpUiCards(cards);
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
