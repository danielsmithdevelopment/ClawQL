/**
 * read_around — expand a hit into the surrounding Markdown section (shared section IDs).
 * Used by vector/vault arms in pageindex-ab and as a general MCP tool.
 */

import { Context, Effect, Layer } from "effect";
import { memoryFromPromise } from "../effect/memory-effect-utils.js";
import { MemoryError } from "../effect/memory-errors.js";
import { readVaultTextFile } from "../vault/utils.js";

export type DocSection = {
  /** Stable id: slug path (e.g. sec-protocols) or heading slug. */
  id: string;
  title: string;
  level: number;
  content: string;
  /** 0-based start offset in the source markdown. */
  startOffset: number;
};

export type ReadAroundInput = {
  /** Vault-relative path or absolute path under the vault. */
  path?: string;
  /** Inline markdown when path is omitted (eval harness). */
  markdown?: string;
  /** Preferred section id from the shared Docling / heading map. */
  sectionId?: string;
  /** Substring or chunk text used to locate the enclosing section. */
  chunkText?: string;
  /** Soft cap on returned content characters (approx tokens×4). */
  tokenBudget?: number;
};

export type ReadAroundResult = {
  ok: boolean;
  path?: string;
  section_id?: string;
  title?: string;
  content?: string;
  truncated?: boolean;
  sections_available?: { id: string; title: string }[];
  error?: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * TOC leader-dot lines and numbered list/procedure steps promoted to ATX.
 * Hard-candidate RFC conversion historically created these; skip so section IDs
 * stay on real headings (defense in depth for vault ingest too).
 */
export function isArtifactHeadingTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  // TOC: "1 Introduction  . . . . . .  3" or dotted leaders
  if (/\.\s+\.\s+\./.test(t) || /\.{3,}/.test(t) || /…/.test(t)) return true;
  if (/\s{2,}\d+\s*$/.test(t) && t.includes(".")) return true;
  // Numbered list / procedure step mistaken for a section heading
  const m = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(t);
  if (m) {
    // Postal codes / page junk ("48155 Münster") — not real section numbers
    const top = Number.parseInt(m[1]!.split(".", 1)[0]!, 10);
    if (Number.isFinite(top) && top > 40) return true;
    const rest = m[2]!;
    if (
      /^(If|Verify|Create|The|A|An|When|For|Note|Ensure|Confirm|Check)\b/.test(rest)
    ) {
      return true;
    }
  }
  return false;
}

/** Split ATX-heading Markdown into sections (H1–H6). Leading prose → sec-preamble. */
export function splitMarkdownSections(markdown: string): DocSection[] {
  const lines = markdown.split(/\r?\n/);
  const headingRe = /^(#{1,6})\s+(.+?)\s*$/;
  type Raw = { level: number; title: string; startLine: number; startOffset: number };
  const heads: Raw[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = headingRe.exec(line);
    if (m) {
      const title = m[2]!.trim();
      if (!isArtifactHeadingTitle(title)) {
        heads.push({
          level: m[1]!.length,
          title,
          startLine: i,
          startOffset: offset,
        });
      }
    }
    offset += line.length + 1;
  }

  const sections: DocSection[] = [];
  const usedIds = new Set<string>();

  function uniqueId(base: string): string {
    let id = base || "section";
    let n = 2;
    while (usedIds.has(id)) {
      id = `${base}-${n++}`;
    }
    usedIds.add(id);
    return id;
  }

  if (heads.length === 0) {
    return [
      {
        id: "sec-preamble",
        title: "(document)",
        level: 1,
        content: markdown,
        startOffset: 0,
      },
    ];
  }

  if (heads[0]!.startOffset > 0) {
    sections.push({
      id: uniqueId("sec-preamble"),
      title: "(preamble)",
      level: 1,
      content: markdown.slice(0, heads[0]!.startOffset).trimEnd(),
      startOffset: 0,
    });
  }

  for (let i = 0; i < heads.length; i++) {
    const h = heads[i]!;
    const end = i + 1 < heads.length ? heads[i + 1]!.startOffset : markdown.length;
    const body = markdown.slice(h.startOffset, end).trimEnd();
    const base = `sec-${slugify(h.title)}`;
    sections.push({
      id: uniqueId(base),
      title: h.title,
      level: h.level,
      content: body,
      startOffset: h.startOffset,
    });
  }
  return sections;
}

function truncateToBudget(text: string, tokenBudget: number): { text: string; truncated: boolean } {
  const maxChars = Math.max(64, tokenBudget * 4);
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + "\n…", truncated: true };
}

export function selectSection(
  sections: DocSection[],
  input: Pick<ReadAroundInput, "sectionId" | "chunkText">
): DocSection | undefined {
  if (input.sectionId) {
    const exact = sections.find((s) => s.id === input.sectionId);
    if (exact) return exact;
    const byTitle = sections.find(
      (s) => slugify(s.title) === slugify(input.sectionId!) || s.id.endsWith(input.sectionId!)
    );
    if (byTitle) return byTitle;
  }
  if (input.chunkText && input.chunkText.trim()) {
    const needle = input.chunkText.trim().slice(0, 200);
    const hit = sections.find((s) => s.content.includes(needle));
    if (hit) return hit;
  }
  return undefined;
}

export function readAroundFromMarkdown(markdown: string, input: ReadAroundInput): ReadAroundResult {
  const sections = splitMarkdownSections(markdown);
  const section = selectSection(sections, input);
  if (!section) {
    return {
      ok: false,
      error: "section_not_found",
      sections_available: sections.map((s) => ({ id: s.id, title: s.title })),
    };
  }
  const budget = input.tokenBudget ?? 1200;
  const { text, truncated } = truncateToBudget(section.content, budget);
  return {
    ok: true,
    section_id: section.id,
    title: section.title,
    content: text,
    truncated,
    sections_available: sections.map((s) => ({ id: s.id, title: s.title })),
  };
}

export function executeReadAroundEffect(
  vault: string | undefined,
  input: ReadAroundInput
): Effect.Effect<ReadAroundResult, MemoryError> {
  return Effect.gen(function* () {
    let markdown = input.markdown;
    if (!markdown && input.path) {
      if (!vault) {
        return {
          ok: false,
          error: "vault_not_configured",
        } satisfies ReadAroundResult;
      }
      markdown = yield* memoryFromPromise(() => readVaultTextFile(vault, input.path!));
    }
    if (!markdown) {
      return { ok: false, error: "path_or_markdown_required" } satisfies ReadAroundResult;
    }
    const result = yield* Effect.sync(() => readAroundFromMarkdown(markdown!, input));
    return { ...result, path: input.path };
  });
}

export class ReadAroundService extends Context.Tag("clawql/ReadAroundService")<
  ReadAroundService,
  {
    readonly readAround: (
      vault: string | undefined,
      input: ReadAroundInput
    ) => Effect.Effect<ReadAroundResult, MemoryError>;
  }
>() {}

export function readAroundLiveLayer(): Layer.Layer<ReadAroundService> {
  return Layer.succeed(
    ReadAroundService,
    ReadAroundService.of({
      readAround: executeReadAroundEffect,
    })
  );
}
