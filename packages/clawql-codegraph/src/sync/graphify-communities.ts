import type { GraphifyGraphJson, GraphifyNode } from "../import/graphify-import.js";

export type GraphifyCommunity = {
  /** Raw community id from Graphify (often numeric). */
  readonly id: string;
  /** Display name from report or fallback `Community N` / `cluster_N`. */
  readonly name: string;
  readonly nodeCount: number;
  readonly sampleLabels: readonly string[];
};

const NUMBERED_CLUSTER_RE = /^(cluster|community)[_\s-]?\d+$/i;

/** True when Leiden labels are auto-generated numbers, not human architecture names. */
export function isNumberedClusterName(name: string): boolean {
  return NUMBERED_CLUSTER_RE.test(name.trim());
}

/**
 * Extract community membership from Graphify `graph.json` node `community` fields.
 * Labels default to `Community {id}` until a report override is applied.
 */
export function extractCommunitiesFromGraphJson(raw: GraphifyGraphJson): GraphifyCommunity[] {
  const buckets = new Map<string, { labels: string[] }>();
  for (const n of raw.nodes ?? []) {
    const community = communityIdOf(n);
    if (community == null) continue;
    const bucket = buckets.get(community) ?? { labels: [] };
    const label = typeof n.label === "string" ? n.label : n.id;
    if (label && bucket.labels.length < 8) bucket.labels.push(label);
    buckets.set(community, bucket);
  }
  return [...buckets.entries()]
    .map(([id, { labels }]) => ({
      id,
      name: `Community ${id}`,
      nodeCount: (raw.nodes ?? []).filter((n) => communityIdOf(n) === id).length,
      sampleLabels: labels,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
}

function communityIdOf(n: GraphifyNode): string | null {
  const c = n.community;
  if (typeof c === "number" && Number.isFinite(c)) return String(c);
  if (typeof c === "string" && c.trim()) return c.trim();
  return null;
}

/**
 * Prefer human-readable community titles from GRAPH_REPORT.md when present
 * (e.g. `## Community 0: Authentication Layer`). Falls back to numbered names.
 */
export function applyReportCommunityNames(
  communities: GraphifyCommunity[],
  reportMd: string | undefined
): GraphifyCommunity[] {
  if (!reportMd?.trim()) return communities;
  const named = new Map<string, string>();
  const headingRe =
    /^#{1,3}\s*(?:Community|Cluster)\s+(\d+|[A-Za-z0-9_-]+)\s*[:\-–—]\s*(.+?)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(reportMd)) !== null) {
    named.set(m[1]!, m[2]!.trim());
  }
  if (named.size === 0) return communities;
  return communities.map((c) => {
    const override = named.get(c.id);
    return override ? { ...c, name: override } : c;
  });
}

/** Wikilink targets for named (non-numbered) clusters only. */
export function communityWikilinks(communities: readonly GraphifyCommunity[]): string[] {
  return communities
    .filter((c) => !isNumberedClusterName(c.name))
    .map((c) => c.name.trim())
    .filter(Boolean);
}
