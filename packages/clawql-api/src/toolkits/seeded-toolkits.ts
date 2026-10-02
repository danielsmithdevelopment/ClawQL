/**
 * Seeded toolkit catalog — packaging over packs/ATR (no new provider runtime).
 */

import type { ClawqlToolkit } from "./types.js";

/** Core SaaS ATR tools (skills_* / memory_* expanded). */
export const DEFAULT_SAAS_ATR_TOOLS = [
  "search",
  "execute",
  "cache",
  "audit",
  "skills_list",
  "skills_get",
  "memory_ingest",
  "memory_recall",
] as const;

/** Read-only ATR subset. */
export const READ_ONLY_ATR_TOOLS = [
  "search",
  "memory_recall",
  "skills_list",
  "skills_get",
] as const;

export const SEEDED_TOOLKITS: readonly ClawqlToolkit[] = [
  {
    id: "default-saas",
    title: "Default SaaS",
    description:
      "Curated default provider pack (Cloudflare, GitHub, Slack, Linear, Notion, Onyx) with search/execute and memory/skills ATR tools.",
    providers: { pack: "default" },
    atrToolsInScope: [...DEFAULT_SAAS_ATR_TOOLS],
    apiKeyScopes: ["search", "execute", "memory", "audit"],
  },
  {
    id: "read-only",
    title: "Read-only",
    description:
      "Same default pack, ATR limited to search, memory_recall, and skills_* (no execute / ingest).",
    providers: { pack: "default" },
    atrToolsInScope: [...READ_ONLY_ATR_TOOLS],
    apiKeyScopes: ["search", "memory"],
  },
  {
    id: "ops-github-slack",
    title: "Ops — GitHub + Slack",
    description: "Explicit enabled vendors github and slack for ops automation.",
    providers: { enabled: ["github", "slack"] },
    atrToolsInScope: [...DEFAULT_SAAS_ATR_TOOLS],
    apiKeyScopes: ["search", "execute", "memory", "audit"],
  },
];

const BY_ID = new Map(SEEDED_TOOLKITS.map((t) => [t.id, t]));

/** Lookup seeded toolkit by id (undefined if unknown). */
export function lookupSeededToolkit(id: string): ClawqlToolkit | undefined {
  const key = id.trim().toLowerCase();
  return BY_ID.get(key);
}

/** All seeded toolkit ids. */
export function listSeededToolkitIds(): readonly string[] {
  return SEEDED_TOOLKITS.map((t) => t.id);
}
