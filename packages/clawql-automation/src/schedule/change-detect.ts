/**
 * Precise change detection for schedule synthetic polls / stream.changed.
 * Projects watched fields, canonicalizes, hashes, and builds capped diffs.
 */

import { createHash } from "node:crypto";

export type ChangeDetectionConfig = {
  /** Dot-paths / top-level keys to keep (required for precise detection). */
  watch_fields: string[];
  /** Paths stripped before hash (volatile fields). */
  exclude_paths?: string[];
  /**
   * For array paths whose order is meaningless, sort by this nested key.
   * Example: `{ "items": "id" }` sorts `items[]` by `id`.
   */
  array_sort_keys?: Record<string, string>;
  /** Send If-None-Match / If-Modified-Since when validators are stored. Default true. */
  conditional_requests?: boolean;
};

export type ProjectionDiff = {
  added: unknown[];
  removed: unknown[];
  changed: Array<{ path: string; before: unknown; after: unknown }>;
  truncated: boolean;
};

export type ChangeDetectResult = {
  changed: boolean;
  baseline: boolean;
  hash: string;
  projection: unknown;
  diff: ProjectionDiff | null;
  not_modified: boolean;
};

const DEFAULT_EXCLUDE = [
  "generated_at",
  "generatedAt",
  "request_id",
  "requestId",
  "timestamp",
  "server_time",
  "serverTime",
  "rate_limit",
  "rateLimit",
  "X-RateLimit-Remaining",
  "x-ratelimit-remaining",
  "next_cursor",
  "nextCursor",
  "page_token",
  "pageToken",
  "etag",
  "ETag",
];

const MAX_DIFF_ENTRIES = 20;
const MAX_DIFF_JSON_BYTES = 8 * 1024;

function splitPath(path: string): string[] {
  return path
    .replace(/\[\]/g, "")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
}

function pathKey(parts: string[]): string {
  return parts.join(".");
}

/** Deep-clone JSON-ish values only. */
function cloneJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Project `data` to watched fields (top-level or nested). Arrays of objects keep
 * only the relative keys under that array path.
 */
export function projectByWatchFields(
  data: unknown,
  watchFields: readonly string[],
  excludePaths: readonly string[] = []
): unknown {
  if (!watchFields.length) {
    return stripExcluded(cloneJson(data), excludePaths.length ? excludePaths : DEFAULT_EXCLUDE);
  }

  const exclude = new Set(
    (excludePaths.length ? excludePaths : []).map((p) => p.trim()).filter(Boolean)
  );

  // Group nested fields: "items.title" → items: ["title"]
  const topLevel = new Set<string>();
  const nested = new Map<string, string[]>();
  for (const raw of watchFields) {
    const parts = splitPath(raw);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      topLevel.add(parts[0]!);
      continue;
    }
    const head = parts[0]!;
    const rest = parts.slice(1).join(".");
    const list = nested.get(head) ?? [];
    list.push(rest);
    nested.set(head, list);
  }

  const projectObject = (obj: Record<string, unknown>, fields: readonly string[]): unknown => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (exclude.has(f)) continue;
      if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
    }
    return out;
  };

  if (Array.isArray(data)) {
    const fields = [...topLevel];
    if (!fields.length && nested.size === 1) {
      // Unusual: watching nested under array root — treat nested keys as element fields
      const only = [...nested.values()][0] ?? [];
      return data.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? projectObject(item as Record<string, unknown>, only)
          : item
      );
    }
    return data.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? projectObject(item as Record<string, unknown>, fields)
        : item
    );
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of topLevel) {
      if (exclude.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
    }
    for (const [head, childFields] of nested) {
      if (exclude.has(head)) continue;
      const child = obj[head];
      if (Array.isArray(child)) {
        out[head] = child.map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? projectObject(item as Record<string, unknown>, childFields)
            : item
        );
      } else if (child && typeof child === "object") {
        out[head] = projectObject(child as Record<string, unknown>, childFields);
      }
    }
    return stripExcluded(out, [...exclude]);
  }

  return data;
}

function stripExcluded(value: unknown, excludePaths: readonly string[]): unknown {
  if (!excludePaths.length) return value;
  const exclude = new Set(excludePaths.map((p) => p.trim()).filter(Boolean));

  const walk = (node: unknown, prefix: string[]): unknown => {
    if (Array.isArray(node)) return node.map((item, i) => walk(item, [...prefix, String(i)]));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const parts = [...prefix, k];
        const dotted = pathKey(parts);
        if (exclude.has(k) || exclude.has(dotted)) continue;
        out[k] = walk(v, parts);
      }
      return out;
    }
    return node;
  };
  return walk(value, []);
}

/**
 * Canonical JSON form: sorted object keys; arrays of objects optionally sorted
 * by configured key; nested values canonicalized.
 */
export function canonicalizeForHash(
  value: unknown,
  arraySortKeys: Record<string, string> = {},
  path = ""
): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const mapped = value.map((item, i) =>
      canonicalizeForHash(item, arraySortKeys, path ? `${path}[]` : "[]")
    );
    const sortKey = arraySortKeys[path] ?? arraySortKeys[path.replace(/\[\]$/, "")];
    if (
      sortKey &&
      mapped.every((item) => item && typeof item === "object" && !Array.isArray(item))
    ) {
      return [...mapped].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[sortKey] ?? "");
        const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
        return av.localeCompare(bv);
      });
    }
    return mapped;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const childPath = path ? `${path}.${k}` : k;
    out[k] = canonicalizeForHash(obj[k], arraySortKeys, childPath);
  }
  return out;
}

export function hashProjection(projection: unknown): string {
  const canonical = canonicalizeForHash(projection);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function identityKey(item: unknown): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const obj = item as Record<string, unknown>;
  for (const k of ["id", "number", "name", "key", "sha", "node_id"]) {
    if (obj[k] != null) return `${k}:${String(obj[k])}`;
  }
  return null;
}

/**
 * Build a small capped diff between previous and next projections.
 */
export function diffProjections(before: unknown, after: unknown): ProjectionDiff {
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const changed: Array<{ path: string; before: unknown; after: unknown }> = [];
  let truncated = false;

  const budget = (): boolean => {
    const size =
      Buffer.byteLength(JSON.stringify({ added, removed, changed }), "utf8") > MAX_DIFF_JSON_BYTES;
    const count = added.length + removed.length + changed.length >= MAX_DIFF_ENTRIES;
    if (size || count) {
      truncated = true;
      return false;
    }
    return true;
  };

  const diffArrays = (beforeArr: unknown[], afterArr: unknown[], pathPrefix: string): void => {
    const beforeMap = new Map<string, unknown>();
    const afterMap = new Map<string, unknown>();
    let useIdentity = true;
    for (const item of beforeArr) {
      const id = identityKey(item);
      if (!id) {
        useIdentity = false;
        break;
      }
      beforeMap.set(id, item);
    }
    if (useIdentity) {
      for (const item of afterArr) {
        const id = identityKey(item);
        if (!id) {
          useIdentity = false;
          break;
        }
        afterMap.set(id, item);
      }
    }
    if (useIdentity) {
      for (const [id, item] of afterMap) {
        if (!budget()) return;
        if (!beforeMap.has(id)) added.push(pathPrefix ? { path: `${pathPrefix}/${id}`, item } : item);
        else {
          const prev = beforeMap.get(id);
          if (JSON.stringify(canonicalizeForHash(prev)) !== JSON.stringify(canonicalizeForHash(item))) {
            changed.push({
              path: pathPrefix ? `${pathPrefix}/${id}` : id,
              before: prev,
              after: item,
            });
          }
        }
      }
      for (const [id, item] of beforeMap) {
        if (!budget()) return;
        if (!afterMap.has(id)) {
          removed.push(pathPrefix ? { path: `${pathPrefix}/${id}`, item } : item);
        }
      }
      return;
    }
    if (JSON.stringify(canonicalizeForHash(beforeArr)) !== JSON.stringify(canonicalizeForHash(afterArr))) {
      if (budget()) {
        changed.push({ path: pathPrefix || "$", before: beforeArr, after: afterArr });
      }
    }
  };

  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, "");
    return { added, removed, changed, truncated };
  }

  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of [...keys].sort()) {
      if (!budget()) break;
      if (!(k in a)) {
        removed.push({ [k]: b[k] });
        continue;
      }
      if (!(k in b)) {
        added.push({ [k]: a[k] });
        continue;
      }
      if (Array.isArray(b[k]) && Array.isArray(a[k])) {
        diffArrays(b[k] as unknown[], a[k] as unknown[], k);
        continue;
      }
      if (
        b[k] &&
        a[k] &&
        typeof b[k] === "object" &&
        typeof a[k] === "object" &&
        !Array.isArray(b[k]) &&
        !Array.isArray(a[k])
      ) {
        const nested = diffProjections(b[k], a[k]);
        for (const item of nested.added) {
          if (!budget()) break;
          added.push(typeof item === "object" && item && !Array.isArray(item) ? { path: k, ...(item as object) } : { path: k, item });
        }
        for (const item of nested.removed) {
          if (!budget()) break;
          removed.push(typeof item === "object" && item && !Array.isArray(item) ? { path: k, ...(item as object) } : { path: k, item });
        }
        for (const c of nested.changed) {
          if (!budget()) break;
          changed.push({ path: `${k}.${c.path}`, before: c.before, after: c.after });
        }
        if (nested.truncated) truncated = true;
        continue;
      }
      if (JSON.stringify(canonicalizeForHash(b[k])) !== JSON.stringify(canonicalizeForHash(a[k]))) {
        changed.push({ path: k, before: b[k], after: a[k] });
      }
    }
    return { added, removed, changed, truncated };
  }

  if (JSON.stringify(canonicalizeForHash(before)) !== JSON.stringify(canonicalizeForHash(after))) {
    changed.push({ path: "$", before, after });
  }
  return { added, removed, changed, truncated };
}

export function summarizeDiff(diff: ProjectionDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  const base = parts.length ? parts.join(", ") : "projection changed";
  return diff.truncated ? `${base} (truncated)` : base;
}

/**
 * Compare previous projection snapshot to the next response body using watch config.
 */
export function detectProjectedChange(input: {
  previousHash: string | null;
  previousProjectionJson: string | null;
  responseBody: string | null;
  config: ChangeDetectionConfig | undefined;
  notModified?: boolean;
}): ChangeDetectResult {
  if (input.notModified) {
    return {
      changed: false,
      baseline: false,
      hash: input.previousHash ?? hashProjection(null),
      projection: input.previousProjectionJson
        ? (JSON.parse(input.previousProjectionJson) as unknown)
        : null,
      diff: null,
      not_modified: true,
    };
  }

  let parsed: unknown = input.responseBody;
  if (typeof input.responseBody === "string") {
    try {
      parsed = JSON.parse(input.responseBody);
    } catch {
      parsed = input.responseBody;
    }
  }

  const watch = input.config?.watch_fields ?? [];
  const exclude = input.config?.exclude_paths?.length
    ? input.config.exclude_paths
    : watch.length
      ? []
      : DEFAULT_EXCLUDE;
  const projected = projectByWatchFields(parsed, watch, exclude);
  const canonical = canonicalizeForHash(projected, input.config?.array_sort_keys ?? {});
  const hash = hashProjection(canonical);

  if (input.previousHash == null) {
    return {
      changed: false,
      baseline: true,
      hash,
      projection: canonical,
      diff: null,
      not_modified: false,
    };
  }

  if (input.previousHash === hash) {
    return {
      changed: false,
      baseline: false,
      hash,
      projection: canonical,
      diff: null,
      not_modified: false,
    };
  }

  let previousProjection: unknown = null;
  if (input.previousProjectionJson) {
    try {
      previousProjection = JSON.parse(input.previousProjectionJson);
    } catch {
      previousProjection = null;
    }
  }
  const diff = diffProjections(previousProjection, canonical);
  return {
    changed: true,
    baseline: false,
    hash,
    projection: canonical,
    diff,
    not_modified: false,
  };
}

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header?.trim()) return null;
  const raw = header.trim();
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && String(asInt) === raw) {
    return Math.min(Math.max(asInt, 1), 86_400) * 1000;
  }
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) return null;
  return Math.min(Math.max(when - now, 1000), 86_400_000);
}

/** Default backoff when upstream returns 429 without Retry-After. */
export const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;

/** Cap stored projection snapshots (third-party data retention). */
export const MAX_PROJECTION_STORE_BYTES = 64 * 1024;

const INSTRUCTION_PREFIX =
  /^\s*(system\s*:|assistant\s*:|ignore (all |previous )?instructions|you are now|do not follow|<\s*\/?\s*system\s*>)/i;

/** Same instruction-wrapper screen as MCP Events delivery (local copy — no package cycle). */
export function screenStoredText(text: string): string {
  const trimmed = text.trimStart();
  if (INSTRUCTION_PREFIX.test(trimmed)) {
    return `[user-authored data] ${text}`;
  }
  return text;
}

function screenStoredValue(value: unknown): unknown {
  if (typeof value === "string") return screenStoredText(value);
  if (Array.isArray(value)) return value.map(screenStoredValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = screenStoredValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Screen + size-cap a projection for SQLite retention. Returns null when over budget
 * (hash still stored; full record unavailable via schedule get until next fit).
 */
export function serializeProjectionForStore(projection: unknown): string | null {
  const screened = screenStoredValue(projection);
  const json = JSON.stringify(screened);
  if (Buffer.byteLength(json, "utf8") > MAX_PROJECTION_STORE_BYTES) {
    return null;
  }
  return json;
}
