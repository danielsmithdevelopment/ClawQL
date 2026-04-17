/**
 * Turn raw URL response bytes into readable Obsidian Markdown (JSON pretty-print, HTML→MD, or fenced text).
 */

import { NodeHtmlMarkdown, type NodeHtmlMarkdownOptions } from "node-html-markdown";

export type UrlIngestKind = "json" | "html" | "text";

export type FormattedUrlIngest = {
  kind: UrlIngestKind;
  /** Note title (H1 in frontmatter). */
  title: string;
  /** Body only (no YAML). */
  bodyMarkdown: string;
};

function hostnameHint(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return "external";
  }
}

function titleFromJson(parsed: unknown, urlStr: string): string {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (typeof o.name === "string" && o.name.trim()) {
      const host = hostnameHint(urlStr);
      if (host.includes("npmjs.org") || host.includes("npmjs.com")) {
        return `npm · ${o.name}`;
      }
      return `Import · ${o.name}`;
    }
    if (typeof o.title === "string" && o.title.trim()) {
      return o.title.trim();
    }
  }
  return `JSON · ${hostnameHint(urlStr)}`;
}

function tryPrettyJson(raw: string): { parsed: unknown; pretty: string } | null {
  const t = raw.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    const pretty = JSON.stringify(parsed, null, 2);
    return { parsed, pretty };
  } catch {
    return null;
  }
}

function firstMarkdownHeading(md: string): string | null {
  const m = md.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

const NHM_OPTIONS: Partial<NodeHtmlMarkdownOptions> = {
  maxConsecutiveNewlines: 2,
  ignore: ["script", "style", "noscript", "svg", "iframe"],
};

/**
 * Format a fetched URL body for storage in a `.md` note.
 */
export function formatUrlResponseAsMarkdown(
  raw: string,
  contentType: string | null,
  sourceUrl: string
): FormattedUrlIngest {
  const ct = (contentType ?? "").toLowerCase();
  const normalized = raw.replace(/\r\n/g, "\n");

  if (ct.includes("json") || ct.endsWith("+json")) {
    const j = tryPrettyJson(normalized);
    if (j) {
      const title = titleFromJson(j.parsed, sourceUrl);
      const bodyMarkdown = ["## Data", "", "```json", j.pretty, "```", ""].join("\n");
      return { kind: "json", title, bodyMarkdown };
    }
  }

  const jsonGuess = tryPrettyJson(normalized);
  if (jsonGuess) {
    const title = titleFromJson(jsonGuess.parsed, sourceUrl);
    const bodyMarkdown = ["## Data", "", "```json", jsonGuess.pretty, "```", ""].join("\n");
    return { kind: "json", title, bodyMarkdown };
  }

  if (
    ct.includes("html") ||
    /^<!DOCTYPE\s+html/i.test(normalized.trim()) ||
    /<\s*html[\s>]/i.test(normalized) ||
    (/<\s*(head|body|article|main|div|p|br)\b/i.test(normalized) && />/.test(normalized))
  ) {
    try {
      let md = NodeHtmlMarkdown.translate(normalized, { ...NHM_OPTIONS });
      md = md.replace(/\n{3,}/g, "\n\n").trim();
      if (md.length === 0) {
        throw new Error("empty html conversion");
      }
      const h1 = firstMarkdownHeading(md);
      const title = h1 ?? `Page · ${hostnameHint(sourceUrl)}`;
      return { kind: "html", title, bodyMarkdown: md };
    } catch {
      /* fall through to text */
    }
  }

  const title = `Text · ${hostnameHint(sourceUrl)}`;
  const bodyMarkdown = ["## Raw text", "", "```text", normalized.trimEnd(), "```", ""].join("\n");
  return { kind: "text", title, bodyMarkdown };
}

export function buildUrlIngestNote(
  sourceUrl: string,
  formatted: FormattedUrlIngest,
  fetchedAt: string
): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(formatted.title)}`,
    `date: ${fetchedAt}`,
    "tags: [clawql-external-ingest]",
    "clawql_external_ingest: true",
    `clawql_external_ingest_kind: ${formatted.kind}`,
    `source_url: ${JSON.stringify(sourceUrl)}`,
    "---",
    "",
    formatted.bodyMarkdown.trimEnd(),
    "",
  ].join("\n");
  return fm;
}
