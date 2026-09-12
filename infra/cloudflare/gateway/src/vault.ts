import type { TenantRow } from "./env.js";

export type MemoryIngestInput = {
  title?: string;
  content: string;
  slug?: string;
  tags?: string[];
};

export type MemoryRecallInput = {
  query: string;
  limit?: number;
};

export type RecallHit = {
  path: string;
  title: string;
  score: number;
  snippet: string;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "note"
  );
}

export function memoryObjectKey(tenant: TenantRow, relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return `${tenant.r2_prefix}/Memory/${clean}`;
}

export function keywordScore(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  if (terms.length === 0) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (hay.includes(term)) hits += 1;
  }
  return hits / terms.length;
}

export function buildMemoryMarkdown(input: MemoryIngestInput, nowIso: string): {
  path: string;
  title: string;
  body: string;
} {
  const title = (input.title?.trim() || "Untitled").slice(0, 200);
  const slug = slugify(input.slug?.trim() || title);
  const path = `${slug}.md`;
  const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const fm = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `created: ${nowIso}`,
    `updated: ${nowIso}`,
    tags.length ? `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]` : null,
    "---",
    "",
    input.content.trim(),
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
  return { path, title, body: fm };
}

export async function memoryIngest(
  vault: R2Bucket,
  db: D1Database,
  tenant: TenantRow,
  input: MemoryIngestInput
): Promise<{ path: string; title: string; key: string }> {
  if (!input.content?.trim()) {
    throw new Error("content is required");
  }
  const now = new Date().toISOString();
  const doc = buildMemoryMarkdown(input, now);
  const key = memoryObjectKey(tenant, doc.path);
  await vault.put(key, doc.body, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { tenant_id: tenant.tenant_id, title: doc.title },
  });
  await db
    .prepare(
      `INSERT INTO vault_index (tenant_id, path, title, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_id, path) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`
    )
    .bind(tenant.tenant_id, doc.path, doc.title, now)
    .run();
  return { path: doc.path, title: doc.title, key };
}

export async function memoryRecall(
  vault: R2Bucket,
  db: D1Database,
  tenant: TenantRow,
  input: MemoryRecallInput
): Promise<{ hits: RecallHit[]; scanned: number }> {
  const query = input.query?.trim() ?? "";
  if (!query) throw new Error("query is required");
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 25);

  const indexed = await db
    .prepare("SELECT path, title FROM vault_index WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200")
    .bind(tenant.tenant_id)
    .all<{ path: string; title: string }>();

  const rows = indexed.results ?? [];
  const scored: RecallHit[] = [];

  for (const row of rows) {
    const key = memoryObjectKey(tenant, row.path);
    const obj = await vault.get(key);
    if (!obj) continue;
    const text = await obj.text();
    const score = keywordScore(query, `${row.title}\n${text}`);
    if (score <= 0) continue;
    const snippet = text.replace(/^---[\s\S]*?---\s*/, "").trim().slice(0, 280);
    scored.push({ path: row.path, title: row.title, score, snippet });
  }

  scored.sort((a, b) => b.score - a.score);
  return { hits: scored.slice(0, limit), scanned: rows.length };
}
