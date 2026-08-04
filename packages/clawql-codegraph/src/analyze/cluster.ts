import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import type { CodeGraphDocument, CodeGraphNode } from "../types.js";
import { communityWikilinks, isNumberedClusterName } from "../sync/graphify-communities.js";

export type CodeGraphCommunity = {
  readonly id: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly sampleLabels: readonly string[];
};

export type ClusterResult = {
  readonly document: CodeGraphDocument;
  readonly communities: readonly CodeGraphCommunity[];
  readonly modularity: number;
  readonly algorithm: "louvain";
};

type LouvainDetailed = {
  communities: Record<string, number>;
  modularity: number;
};

type LouvainFn = {
  (graph: UndirectedGraph): Record<string, number>;
  detailed: (graph: UndirectedGraph) => LouvainDetailed;
};

/**
 * Assign Louvain communities onto a copy of the document (undirected projection of edges).
 * Writes numeric `community` on each node; names stay `Community N` unless later renamed.
 */
export function assignLouvainCommunities(doc: CodeGraphDocument): ClusterResult {
  const g = new UndirectedGraph({ multi: false, allowSelfLoops: false });
  for (const id of Object.keys(doc.nodes)) {
    if (!g.hasNode(id)) g.addNode(id);
  }
  for (const edge of doc.edges) {
    if (!g.hasNode(edge.from) || !g.hasNode(edge.to)) continue;
    if (edge.from === edge.to) continue;
    if (g.hasEdge(edge.from, edge.to) || g.hasEdge(edge.to, edge.from)) continue;
    g.addEdge(edge.from, edge.to);
  }

  let communitiesMap: Record<string, number> = {};
  let modularity = 0;
  if (g.order > 0 && g.size > 0) {
    const detailed = (louvain as unknown as LouvainFn).detailed(g);
    communitiesMap = detailed.communities;
    modularity = detailed.modularity;
  } else {
    let i = 0;
    for (const id of Object.keys(doc.nodes)) {
      communitiesMap[id] = i++;
    }
  }

  for (const id of Object.keys(doc.nodes)) {
    if (communitiesMap[id] === undefined) {
      communitiesMap[id] = Math.max(0, ...Object.values(communitiesMap), -1) + 1;
    }
  }

  const nodes: Record<string, CodeGraphNode> = {};
  for (const [id, node] of Object.entries(doc.nodes)) {
    nodes[id] = { ...node, community: communitiesMap[id]! };
  }

  const buckets = new Map<number, { labels: string[]; count: number }>();
  for (const node of Object.values(nodes)) {
    const cid = typeof node.community === "number" ? node.community : Number(node.community);
    const bucket = buckets.get(cid) ?? { labels: [], count: 0 };
    bucket.count += 1;
    if (node.name && bucket.labels.length < 8) bucket.labels.push(node.name);
    buckets.set(cid, bucket);
  }

  const communities: CodeGraphCommunity[] = [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
    .map(([id, { labels, count }]) => ({
      id: String(id),
      name: `Community ${id}`,
      nodeCount: count,
      sampleLabels: labels,
    }));

  return {
    document: {
      ...doc,
      nodes,
      builtAt: new Date().toISOString(),
    },
    communities,
    modularity,
    algorithm: "louvain",
  };
}

export { communityWikilinks, isNumberedClusterName };
