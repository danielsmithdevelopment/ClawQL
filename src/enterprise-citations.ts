/**
 * Structured enterprise (e.g. Onyx) citations for `memory_ingest` — small vault-safe
 * summaries without pasting full retrieval payloads (GitHub #130).
 */

export type EnterpriseCitation = {
  title?: string;
  url?: string;
  document_id?: string;
  source?: string;
  snippet?: string;
};

const MAX_TITLE = 500;
const MAX_URL = 2048;
const MAX_ID = 200;
const MAX_SOURCE = 200;
const MAX_SNIPPET = 400;

function clip(s: string | undefined, max: number): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/**
 * Normalize one citation for storage and for stable content hashing.
 */
export function normalizeEnterpriseCitation(c: EnterpriseCitation): EnterpriseCitation {
  return {
    title: clip(c.title, MAX_TITLE),
    url: clip(c.url, MAX_URL),
    document_id: clip(c.document_id, MAX_ID),
    source: clip(c.source, MAX_SOURCE),
    snippet: clip(c.snippet, MAX_SNIPPET),
  };
}

export function normalizeEnterpriseCitations(
  list: EnterpriseCitation[] | undefined
): EnterpriseCitation[] | undefined {
  if (!list?.length) return undefined;
  const out: EnterpriseCitation[] = [];
  for (const raw of list) {
    const n = normalizeEnterpriseCitation(raw);
    if (n.title || n.url || n.document_id || n.source || n.snippet) {
      out.push(n);
    }
  }
  return out.length ? out : undefined;
}

function cmpCitation(a: EnterpriseCitation, b: EnterpriseCitation): number {
  const ka = `${a.document_id ?? ""}\t${a.url ?? ""}\t${a.title ?? ""}`;
  const kb = `${b.document_id ?? ""}\t${b.url ?? ""}\t${b.title ?? ""}`;
  return ka.localeCompare(kb);
}

/** Canonical JSON for hashing duplicate ingest sections. */
export function stableEnterpriseCitationsPayload(list: EnterpriseCitation[] | undefined): string {
  const n = normalizeEnterpriseCitations(list);
  if (!n?.length) return "";
  return JSON.stringify([...n].sort(cmpCitation));
}

function docToCitation(doc: Record<string, unknown>): EnterpriseCitation | undefined {
  const document_id =
    asNonEmptyString(doc.document_id) ??
    asNonEmptyString(doc.id) ??
    (typeof doc.document_id === "number" ? String(doc.document_id) : undefined);
  const semantic = asNonEmptyString(doc.semantic_identifier);
  const title = asNonEmptyString(doc.title) ?? semantic;
  const link =
    asNonEmptyString(doc.link) ?? asNonEmptyString(doc.url) ?? asNonEmptyString(doc.source_url);
  const source = asNonEmptyString(doc.source);
  let snippet: string | undefined;
  const chunks = doc.chunks;
  if (Array.isArray(chunks) && chunks.length > 0) {
    const first = chunks[0];
    if (first && typeof first === "object") {
      const t = asNonEmptyString((first as Record<string, unknown>).content);
      snippet = t ?? asNonEmptyString((first as Record<string, unknown>).text);
    }
  }
  if (!title && !link && !document_id && !snippet && !source) return undefined;
  return normalizeEnterpriseCitation({
    title,
    url: link,
    document_id,
    source,
    snippet,
  });
}

/**
 * Best-effort extraction from typical Onyx `send-search-message` JSON shapes.
 */
export function extractEnterpriseCitationsFromOnyxSearchJson(data: unknown): EnterpriseCitation[] {
  if (data === null || data === undefined) return [];
  if (typeof data !== "object") return [];

  const root = data as Record<string, unknown>;
  const tryDocs = (o: Record<string, unknown>): EnterpriseCitation[] => {
    const raw = o.documents ?? o.results;
    if (!Array.isArray(raw)) return [];
    const out: EnterpriseCitation[] = [];
    for (const item of raw) {
      if (item && typeof item === "object") {
        const c = docToCitation(item as Record<string, unknown>);
        if (c) out.push(c);
      }
    }
    return out;
  };

  let found = tryDocs(root);
  if (found.length) return found.slice(0, 30);

  const nested = root.data ?? root.response;
  if (nested && typeof nested === "object") {
    found = tryDocs(nested as Record<string, unknown>);
  }
  return found.slice(0, 30);
}

/**
 * Parse the JSON text from a `knowledge_search_onyx` / `execute` tool result into citations.
 */
export function enterpriseCitationsFromOnyxSearchToolText(
  text: string
): { ok: true; citations: EnterpriseCitation[] } | { ok: false; error: string } {
  const t = text?.trim() ?? "";
  if (!t) return { ok: false, error: "empty tool output" };
  try {
    const data = JSON.parse(t) as unknown;
    if (data && typeof data === "object" && "error" in (data as object)) {
      const err = (data as Record<string, unknown>).error;
      if (err !== undefined && err !== null) {
        return { ok: false, error: typeof err === "string" ? err : JSON.stringify(err) };
      }
    }
    const citations = extractEnterpriseCitationsFromOnyxSearchJson(data);
    return { ok: true, citations: normalizeEnterpriseCitations(citations) ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function formatEnterpriseCitationsMarkdownBlock(citations: EnterpriseCitation[]): string {
  if (!citations.length) return "";
  const lines: string[] = [];
  lines.push("#### Enterprise citations (Onyx)");
  for (const c of citations) {
    const parts: string[] = [];
    if (c.title) parts.push(c.title.replace(/\s+/g, " ").trim());
    if (c.url) parts.push(`\`${c.url}\``);
    if (c.document_id) parts.push(`id \`${String(c.document_id).replace(/`/g, "'")}\``);
    if (c.source) parts.push(`source \`${c.source.replace(/`/g, "'")}\``);
    lines.push(`- ${parts.join(" · ") || "(citation)"}`);
    if (c.snippet) {
      const one = c.snippet.replace(/\s+/g, " ").trim();
      lines.push(`  > ${one}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
