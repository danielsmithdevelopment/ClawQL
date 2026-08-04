/**
 * OKF YAML frontmatter parse / serialize for vault Markdown notes (OKF v0.2).
 */

import {
  DEFAULT_OKF_MEMORY_TYPE,
  OKF_FORMAT_VERSION,
  OKF_INGEST_TAG,
  type BuildOkfFrontmatterInput,
  type OkfGenerated,
  type OkfMemoryFrontmatter,
  type OkfSource,
  type OkfStatus,
  type OkfVerified,
} from "./types.js";

/** Minimal frontmatter map — scalars, arrays, and shallow objects. */
export type ParsedFrontmatter = Record<
  string,
  string | string[] | boolean | null | number | Record<string, unknown> | unknown[]
>;

function yamlScalar(value: string | null | undefined): string {
  if (value === null) return "null";
  if (value === undefined) return '""';
  return JSON.stringify(value);
}

function yamlTags(tags: string[]): string {
  if (tags.length === 0) return "[]";
  return `[${tags.map((t) => JSON.stringify(t)).join(", ")}]`;
}

function indentBlock(lines: string[], spaces = 2): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((l) => (l.length ? `${pad}${l}` : l));
}

function serializeGenerated(g: OkfGenerated): string[] {
  const lines: string[] = ["generated:"];
  if (g.by) lines.push(...indentBlock([`by: ${yamlScalar(g.by)}`]));
  if (g.at) lines.push(...indentBlock([`at: ${yamlScalar(g.at)}`]));
  if (g.tool) lines.push(...indentBlock([`tool: ${yamlScalar(g.tool)}`]));
  if (g.model) lines.push(...indentBlock([`model: ${yamlScalar(g.model)}`]));
  if (g.session) lines.push(...indentBlock([`session: ${yamlScalar(g.session)}`]));
  return lines.length > 1 ? lines : [];
}

function serializeVerified(v: OkfVerified): string[] {
  const lines: string[] = ["verified:"];
  if (v.by) lines.push(...indentBlock([`by: ${yamlScalar(String(v.by))}`]));
  if (v.at) lines.push(...indentBlock([`at: ${yamlScalar(v.at)}`]));
  if (v.method) lines.push(...indentBlock([`method: ${yamlScalar(String(v.method))}`]));
  if (v.reviewer) lines.push(...indentBlock([`reviewer: ${yamlScalar(v.reviewer)}`]));
  return lines.length > 1 ? lines : [];
}

function serializeSources(sources: OkfSource[]): string[] {
  if (!sources.length) return [];
  const lines: string[] = ["sources:"];
  for (const s of sources) {
    const entries = Object.entries(s);
    if (!entries.length) continue;
    const [firstKey, firstVal] = entries[0]!;
    lines.push(`  - ${firstKey}: ${yamlScalar(String(firstVal))}`);
    for (const [k, v] of entries.slice(1)) {
      lines.push(`    ${k}: ${yamlScalar(String(v))}`);
    }
  }
  return lines;
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

function unquote(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1)}"` : s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseScalar(raw: string): string | boolean | null | number {
  const t = raw.trim();
  if (t === "" || t === '""') return "";
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return unquote(t);
}

/**
 * Best-effort YAML parser for ClawQL vault frontmatter.
 * Supports scalars, tag arrays, indented nested objects, and list-of-maps (`sources`).
 */
export function parseFrontmatterBlock(block: string): ParsedFrontmatter {
  const out: ParsedFrontmatter = {};
  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!top) {
      i++;
      continue;
    }
    const key = top[1]!;
    const rest = top[2]!.trim();

    // Nested object: `key:` followed by indented `  child: value`
    if (rest === "" && i + 1 < lines.length && /^\s{2}\S/.test(lines[i + 1]!)) {
      // List-of-maps under key
      if (lines[i + 1]!.match(/^\s{2}-\s+/)) {
        const items: Record<string, unknown>[] = [];
        i++;
        while (i < lines.length && /^\s{2}-\s+/.test(lines[i]!)) {
          const item: Record<string, unknown> = {};
          const first = lines[i]!.match(/^\s{2}-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
          if (first) {
            item[first[1]!] = parseScalar(first[2]!);
          }
          i++;
          while (i < lines.length && /^\s{4}[A-Za-z0-9_-]+:/.test(lines[i]!)) {
            const m = lines[i]!.match(/^\s{4}([A-Za-z0-9_-]+):\s*(.*)$/);
            if (m) item[m[1]!] = parseScalar(m[2]!);
            i++;
          }
          items.push(item);
        }
        out[key] = items;
        continue;
      }
      const obj: Record<string, unknown> = {};
      i++;
      while (i < lines.length && /^\s{2}[A-Za-z0-9_-]+:/.test(lines[i]!)) {
        const m = lines[i]!.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/);
        if (m) obj[m[1]!] = parseScalar(m[2]!);
        i++;
      }
      out[key] = obj;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      out[key] = inner ? inner.split(",").map((t) => unquote(t.trim())) : [];
      i++;
      continue;
    }

    out[key] = parseScalar(rest);
    i++;
  }
  return out;
}

export function parseVaultFrontmatter(markdown: string): ParsedFrontmatter {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return {};
  return parseFrontmatterBlock(frontmatter);
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((t): t is string => typeof t === "string" && !!t.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function asGenerated(v: unknown): OkfGenerated | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const g: OkfGenerated = {
    ...(asString(o.by) ? { by: asString(o.by) } : {}),
    ...(asString(o.at) ? { at: asString(o.at) } : {}),
    ...(asString(o.tool) ? { tool: asString(o.tool) } : {}),
    ...(asString(o.model) ? { model: asString(o.model) } : {}),
    ...(asString(o.session) ? { session: asString(o.session) } : {}),
  };
  return Object.keys(g).length ? g : undefined;
}

function asVerified(v: unknown): OkfVerified | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const ver: OkfVerified = {
    ...(asString(o.by) ? { by: asString(o.by) } : {}),
    ...(asString(o.at) ? { at: asString(o.at) } : {}),
    ...(asString(o.method) ? { method: asString(o.method) } : {}),
    ...(asString(o.reviewer) ? { reviewer: asString(o.reviewer) } : {}),
  };
  return Object.keys(ver).length ? ver : undefined;
}

function asSources(v: unknown): OkfSource[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: OkfSource[] = [];
  for (const row of v) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      out.push(row as OkfSource);
    }
  }
  return out.length ? out : undefined;
}

function asStatus(v: unknown): OkfStatus | undefined {
  const s = asString(v);
  if (s === "current" || s === "stale" || s === "superseded" || s === "retracted") return s;
  return undefined;
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
    input.resource === undefined
      ? undefined
      : input.resource === null
        ? null
        : input.resource.trim() || null;
  const correlation = input.correlationId?.trim() || undefined;
  const agentId = input.agentId?.trim() || undefined;
  const verdict = input.verdict?.trim() || undefined;
  const wormRef =
    input.wormRef === undefined
      ? undefined
      : input.wormRef === null
        ? null
        : input.wormRef.trim() || null;

  const generated: OkfGenerated = {
    ...(input.generated ?? {}),
  };
  if (!generated.by && agentId) generated.by = agentId;
  if (!generated.at) generated.at = timestamp;
  if (!generated.tool) generated.tool = "memory_ingest";
  if (!generated.model && input.model?.trim()) generated.model = input.model.trim();
  if (!generated.session && input.sessionId?.trim()) generated.session = input.sessionId.trim();
  if (!generated.session && correlation) generated.session = correlation;

  const status: OkfStatus = input.status ?? "current";

  return {
    type: resolveOkfType(input.type),
    title: input.title,
    ...(description ? { description } : {}),
    ...(resource !== undefined ? { resource } : {}),
    tags: normalizeIngestTags(input.tags),
    timestamp,
    generated,
    ...(input.verified ? { verified: input.verified } : {}),
    ...(input.sources?.length ? { sources: input.sources } : {}),
    ...(input.staleAfter?.trim() ? { stale_after: input.staleAfter.trim() } : {}),
    status,
    ...(input.supersededBy !== undefined ? { superseded_by: input.supersededBy } : {}),
    ...(correlation ? { correlation_id: correlation } : {}),
    ...(wormRef !== undefined ? { worm_ref: wormRef } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(verdict ? { verdict } : {}),
    ...(typeof input.confidenceScore === "number" && Number.isFinite(input.confidenceScore)
      ? { confidence_score: input.confidenceScore }
      : {}),
    date: timestamp,
    clawql_ingest: true,
    clawql_ingest_created: createdAt,
    clawql_okf: true,
    okf_version: OKF_FORMAT_VERSION,
  };
}

/** Serialize OKF memory frontmatter to a YAML block including surrounding `---`. */
export function serializeOkfMemoryFrontmatter(fm: OkfMemoryFrontmatter): string {
  const lines: string[] = ["---", `type: ${yamlScalar(fm.type)}`, `title: ${yamlScalar(fm.title)}`];
  if (fm.description) lines.push(`description: ${yamlScalar(fm.description)}`);
  if (fm.resource !== undefined) lines.push(`resource: ${yamlScalar(fm.resource)}`);
  lines.push(`tags: ${yamlTags(fm.tags)}`);
  lines.push(`timestamp: ${yamlScalar(fm.timestamp)}`);

  if (fm.generated) lines.push(...serializeGenerated(fm.generated));
  if (fm.verified) lines.push(...serializeVerified(fm.verified));
  if (fm.sources?.length) lines.push(...serializeSources(fm.sources));
  if (fm.stale_after) lines.push(`stale_after: ${yamlScalar(fm.stale_after)}`);
  if (fm.status) lines.push(`status: ${yamlScalar(fm.status)}`);
  if (fm.superseded_by !== undefined) {
    lines.push(`superseded_by: ${yamlScalar(fm.superseded_by)}`);
  }

  if (fm.correlation_id) lines.push(`correlation_id: ${yamlScalar(fm.correlation_id)}`);
  if (fm.worm_ref !== undefined) lines.push(`worm_ref: ${yamlScalar(fm.worm_ref)}`);
  if (fm.agent_id) lines.push(`agent_id: ${yamlScalar(fm.agent_id)}`);
  if (fm.verdict) lines.push(`verdict: ${yamlScalar(fm.verdict)}`);
  if (typeof fm.confidence_score === "number") {
    lines.push(`confidence_score: ${fm.confidence_score}`);
  }
  lines.push(`date: ${fm.date}`);
  lines.push("clawql_ingest: true");
  lines.push(`clawql_ingest_created: ${yamlScalar(fm.clawql_ingest_created)}`);
  lines.push("clawql_okf: true");
  lines.push(`okf_version: ${yamlScalar(fm.okf_version ?? OKF_FORMAT_VERSION)}`);
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

export function buildOkfFrontmatterString(input: BuildOkfFrontmatterInput): string {
  return serializeOkfMemoryFrontmatter(buildOkfMemoryFrontmatter(input));
}

/**
 * Upgrade legacy vault notes that lack OKF `type` / `clawql_okf` / v0.2 trust signals.
 * Preserves unknown keys via rebuild. Returns original markdown when already OKF v0.2-complete.
 */
export function ensureOkfFrontmatter(
  markdown: string,
  defaults: { title: string; type?: string; description?: string }
): string {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const parsed = frontmatter ? parseFrontmatterBlock(frontmatter) : {};
  const hasType = typeof parsed.type === "string" && parsed.type.trim().length > 0;
  const hasOkfFlag = parsed.clawql_okf === true;
  const hasV02 = parsed.okf_version === OKF_FORMAT_VERSION || asStatus(parsed.status) != null;
  if (hasType && hasOkfFlag && hasV02) return markdown;

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
    resource: parsed.resource === null ? null : (asString(parsed.resource) ?? undefined),
    tags,
    timestamp,
    createdAt,
    correlationId: asString(parsed.correlation_id),
    wormRef: parsed.worm_ref === null ? null : asString(parsed.worm_ref),
    agentId: asString(parsed.agent_id),
    verdict: asString(parsed.verdict),
    generated: asGenerated(parsed.generated),
    verified: asVerified(parsed.verified),
    sources: asSources(parsed.sources),
    staleAfter: asString(parsed.stale_after),
    status: asStatus(parsed.status) ?? "current",
    supersededBy:
      parsed.superseded_by === null ? null : (asString(parsed.superseded_by) ?? undefined),
  });

  return `${serializeOkfMemoryFrontmatter(fm)}${body.replace(/^\n*/, "")}`;
}

/**
 * Non-destructive OKF v0.2 migration — adds `status: current` + `okf_version: "0.2"`
 * and default `generated` when missing. Does not rewrite body content.
 */
export function migrateOkfFrontmatterToV02(markdown: string, titleFallback: string): string {
  return ensureOkfFrontmatter(markdown, { title: titleFallback });
}

/** Prefer OKF `timestamp`, then legacy `clawql_ingest_created` / `date`. */
export function resolveNoteTimestampIso(fm: ParsedFrontmatter): string | undefined {
  for (const key of ["timestamp", "clawql_ingest_created", "date"] as const) {
    const v = asString(fm[key])?.trim();
    if (v && Number.isFinite(Date.parse(v))) return v;
  }
  return undefined;
}

/** True when recall should exclude this note (`status: retracted`). */
export function isOkfRetracted(fm: ParsedFrontmatter): boolean {
  return asStatus(fm.status) === "retracted";
}

/** True when `stale_after` is in the past or status is already stale/superseded. */
export function isOkfStale(fm: ParsedFrontmatter, now = Date.now()): boolean {
  const status = asStatus(fm.status);
  if (status === "stale" || status === "superseded") return true;
  const staleAfter = asString(fm.stale_after)?.trim();
  if (!staleAfter) return false;
  const t = Date.parse(staleAfter);
  return Number.isFinite(t) && t < now;
}

export { asStatus, asGenerated, asVerified, asSources };
