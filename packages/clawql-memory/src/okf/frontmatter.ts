/**
 * OKF YAML frontmatter parse / serialize for vault Markdown notes.
 */

import {
  DEFAULT_OKF_MEMORY_TYPE,
  OKF_INGEST_TAG,
  type BuildOkfFrontmatterInput,
  type OkfMemoryFrontmatter,
} from "./types.js";

/** Minimal frontmatter map (string | string[] | boolean | null). */
export type ParsedFrontmatter = Record<string, string | string[] | boolean | null>;

function yamlScalar(value: string | null | undefined): string {
  if (value === null) return "null";
  if (value === undefined) return '""';
  return JSON.stringify(value);
}

function yamlTags(tags: string[]): string {
  if (tags.length === 0) return "[]";
  return `[${tags.map((t) => JSON.stringify(t)).join(", ")}]`;
}

/** Split leading `--- ... ---` frontmatter from body. */
export function splitFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
  if (!markdown.startsWith("---\n")) {
    return { frontmatter: null, body: markdown };
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: null, body: markdown };
  }
  return {
    frontmatter: markdown.slice(4, end),
    body: markdown.slice(end + 5),
  };
}

/**
 * Best-effort line-oriented YAML parser for ClawQL vault frontmatter.
 * Supports scalars, JSON-quoted strings, `null`, booleans, and `[a, b]` tag arrays.
 * Does not support nested objects or multi-line YAML lists.
 */
export function parseFrontmatterBlock(block: string): ParsedFrontmatter {
  const out: ParsedFrontmatter = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let raw = m[2]!.trim();
    if (raw === "") {
      out[key] = "";
      continue;
    }
    if (raw === "null") {
      out[key] = null;
      continue;
    }
    if (raw === "true" || raw === "false") {
      out[key] = raw === "true";
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      if (!inner) {
        out[key] = [];
        continue;
      }
      out[key] = inner.split(",").map((t) => {
        let s = t.trim();
        if (
          (s.startsWith('"') && s.endsWith('"')) ||
          (s.startsWith("'") && s.endsWith("'"))
        ) {
          try {
            s = JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1)}"` : s) as string;
          } catch {
            s = s.slice(1, -1);
          }
        }
        return s;
      });
      continue;
    }
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      try {
        raw = JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1)}"` : raw) as string;
      } catch {
        raw = raw.slice(1, -1);
      }
    }
    out[key] = raw;
  }
  return out;
}

export function parseVaultFrontmatter(markdown: string): ParsedFrontmatter {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return {};
  return parseFrontmatterBlock(frontmatter);
}

function asString(v: string | string[] | boolean | null | undefined): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
}

function asTags(v: string | string[] | boolean | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter((t) => typeof t === "string" && t.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/** Normalize caller tags and always include `clawql-ingest`. */
export function normalizeIngestTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [OKF_INGEST_TAG, ...(tags ?? [])]) {
    const n = t.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function resolveOkfType(raw: string | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : DEFAULT_OKF_MEMORY_TYPE;
}

export function buildOkfMemoryFrontmatter(input: BuildOkfFrontmatterInput): OkfMemoryFrontmatter {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const createdAt = input.createdAt ?? timestamp;
  const description = input.description?.trim() || undefined;
  const resource =
    input.resource === undefined ? undefined : input.resource === null ? null : input.resource.trim() || null;
  const correlation = input.correlationId?.trim() || undefined;
  const agentId = input.agentId?.trim() || undefined;
  const verdict = input.verdict?.trim() || undefined;
  const wormRef =
    input.wormRef === undefined
      ? undefined
      : input.wormRef === null
        ? null
        : input.wormRef.trim() || null;

  return {
    type: resolveOkfType(input.type),
    title: input.title,
    ...(description ? { description } : {}),
    ...(resource !== undefined ? { resource } : {}),
    tags: normalizeIngestTags(input.tags),
    timestamp,
    ...(correlation ? { correlation_id: correlation } : {}),
    ...(wormRef !== undefined ? { worm_ref: wormRef } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(verdict ? { verdict } : {}),
    date: timestamp,
    clawql_ingest: true,
    clawql_ingest_created: createdAt,
    clawql_okf: true,
  };
}

/** Serialize OKF memory frontmatter to a YAML block including surrounding `---`. */
export function serializeOkfMemoryFrontmatter(fm: OkfMemoryFrontmatter): string {
  const lines: string[] = [
    "---",
    `type: ${yamlScalar(fm.type)}`,
    `title: ${yamlScalar(fm.title)}`,
  ];
  if (fm.description) lines.push(`description: ${yamlScalar(fm.description)}`);
  if (fm.resource !== undefined) lines.push(`resource: ${yamlScalar(fm.resource)}`);
  lines.push(`tags: ${yamlTags(fm.tags)}`);
  lines.push(`timestamp: ${yamlScalar(fm.timestamp)}`);
  if (fm.correlation_id) lines.push(`correlation_id: ${yamlScalar(fm.correlation_id)}`);
  if (fm.worm_ref !== undefined) lines.push(`worm_ref: ${yamlScalar(fm.worm_ref)}`);
  if (fm.agent_id) lines.push(`agent_id: ${yamlScalar(fm.agent_id)}`);
  if (fm.verdict) lines.push(`verdict: ${yamlScalar(fm.verdict)}`);
  lines.push(`date: ${fm.date}`);
  lines.push("clawql_ingest: true");
  lines.push(`clawql_ingest_created: ${yamlScalar(fm.clawql_ingest_created)}`);
  lines.push("clawql_okf: true");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

export function buildOkfFrontmatterString(input: BuildOkfFrontmatterInput): string {
  return serializeOkfMemoryFrontmatter(buildOkfMemoryFrontmatter(input));
}

/**
 * Upgrade legacy vault notes that lack OKF `type` / `clawql_okf`.
 * Preserves unknown keys. Returns original markdown when already OKF-complete.
 */
export function ensureOkfFrontmatter(
  markdown: string,
  defaults: { title: string; type?: string; description?: string }
): string {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const parsed = frontmatter ? parseFrontmatterBlock(frontmatter) : {};
  const hasType = typeof parsed.type === "string" && parsed.type.trim().length > 0;
  const hasOkfFlag = parsed.clawql_okf === true;
  if (hasType && hasOkfFlag) return markdown;

  const title = asString(parsed.title)?.trim() || defaults.title;
  const timestamp =
    asString(parsed.timestamp) ||
    asString(parsed.date) ||
    asString(parsed.clawql_ingest_created) ||
    new Date().toISOString();
  const createdAt = asString(parsed.clawql_ingest_created) || timestamp;
  const tags = normalizeIngestTags(asTags(parsed.tags));
  const description =
    asString(parsed.description)?.trim() || defaults.description?.trim() || undefined;

  const fm = buildOkfMemoryFrontmatter({
    title,
    type: hasType ? asString(parsed.type) : defaults.type,
    description,
    resource: parsed.resource === null ? null : asString(parsed.resource) ?? undefined,
    tags,
    timestamp,
    createdAt,
    correlationId: asString(parsed.correlation_id),
    wormRef: parsed.worm_ref === null ? null : asString(parsed.worm_ref),
    agentId: asString(parsed.agent_id),
    verdict: asString(parsed.verdict),
  });

  return `${serializeOkfMemoryFrontmatter(fm)}${body.replace(/^\n*/, "")}`;
}

/** Prefer OKF `timestamp`, then legacy `clawql_ingest_created` / `date`. */
export function resolveNoteTimestampIso(fm: ParsedFrontmatter): string | undefined {
  for (const key of ["timestamp", "clawql_ingest_created", "date"] as const) {
    const v = asString(fm[key])?.trim();
    if (v && Number.isFinite(Date.parse(v))) return v;
  }
  return undefined;
}
