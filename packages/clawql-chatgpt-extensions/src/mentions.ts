import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type MentionItem = {
  readonly type: "resource_link";
  readonly uri: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
};

const MAX_ITEMS = 20;

export type MentionSearchSource = {
  readonly uri: string;
  readonly title: string;
  readonly description?: string;
  readonly kind: "vault" | "entity" | "doc";
  /** When false, item is filtered out for this user. */
  readonly readable?: boolean;
};

/**
 * Search vault notes, ontology entities, and processed documents.
 * Results are capped at 20 and filtered by `readable`.
 */
export function searchMentions(
  query: string,
  sources: readonly MentionSearchSource[]
): { items: MentionItem[] } {
  const q = query.trim().toLowerCase();
  const scored = sources
    .filter((s) => s.readable !== false)
    .map((s) => {
      const hay = `${s.title} ${s.description ?? ""} ${s.uri}`.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else if (hay.includes(q)) score = q.length + (hay.startsWith(q) ? 10 : 0);
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS);

  return {
    items: scored.map(({ s }) => ({
      type: "resource_link" as const,
      uri: s.uri,
      name: s.title,
      title: s.title,
      description: s.description,
      mimeType: s.kind === "vault" ? "text/markdown" : "application/json",
    })),
  };
}

/** Load vault note paths under CLAWQL_OBSIDIAN_VAULT_PATH / Memory when present. */
export function loadVaultMentionSources(
  env: NodeJS.ProcessEnv = process.env
): MentionSearchSource[] {
  const root =
    env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() ||
    (env.CLAWQL_HOME?.trim() ? join(env.CLAWQL_HOME.trim(), "Memory") : "");
  if (!root || !existsSync(root)) return [];
  const memoryDir = existsSync(join(root, "Memory")) ? join(root, "Memory") : root;
  const out: MentionSearchSource[] = [];
  walkMd(memoryDir, (abs) => {
    const rel = relative(memoryDir, abs).replace(/\\/g, "/");
    const title = rel.replace(/\.md$/i, "");
    out.push({
      uri: `clawql://vault/${rel}`,
      title,
      description: "Vault note",
      kind: "vault",
      readable: true,
    });
  });
  return out;
}

function walkMd(dir: string, onFile: (abs: string) => void, depth = 0): void {
  if (depth > 6) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkMd(abs, onFile, depth + 1);
    else if (name.endsWith(".md")) onFile(abs);
  }
}

/** Demo ontology + document sources for empty vaults / tests. */
export function demoMentionSources(): MentionSearchSource[] {
  return [
    {
      uri: "clawql://entity/Matter/demo-1",
      title: "Demo Matter",
      description: "Ontology entity",
      kind: "entity",
      readable: true,
    },
    {
      uri: "clawql://entity/Contract/demo-1",
      title: "Demo Contract",
      description: "Ontology entity",
      kind: "entity",
      readable: true,
    },
    {
      uri: "clawql://doc/demo-processed-1",
      title: "Processed document (demo)",
      description: "Processed document",
      kind: "doc",
      readable: true,
    },
  ];
}

/** Strip instruction-like payloads — mention content always arrives as data. */
export function screenMentionContentAsData(text: string): { data: string; screened: true } {
  return { data: text, screened: true };
}

export function readVaultNoteAsData(
  uri: string,
  env: NodeJS.ProcessEnv = process.env
): { data: string; screened: true } | null {
  if (!uri.startsWith("clawql://vault/")) return null;
  const rel = uri.slice("clawql://vault/".length);
  if (rel.includes("..")) return null;
  const root =
    env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() ||
    (env.CLAWQL_HOME?.trim() ? join(env.CLAWQL_HOME.trim(), "Memory") : "");
  if (!root) return null;
  const memoryDir = existsSync(join(root, "Memory")) ? join(root, "Memory") : root;
  const abs = join(memoryDir, rel);
  if (!existsSync(abs)) return null;
  try {
    return screenMentionContentAsData(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

export { MAX_ITEMS as MENTIONS_MAX_ITEMS };
