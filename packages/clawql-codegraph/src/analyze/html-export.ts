import type { CodeGraphDocument } from "../types.js";
import type { CodeGraphCommunity } from "./cluster.js";

/**
 * Minimal standalone HTML visualization (vis-network via CDN).
 * Written to disk for humans — not ingested into the vault.
 */
export function renderGraphHtml(options: {
  document: CodeGraphDocument;
  communities: readonly CodeGraphCommunity[];
  title?: string;
}): string {
  const { document: doc, communities, title } = options;
  const communityColor = new Map<string, string>();
  const palette = [
    "#4e79a7",
    "#f28e2b",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc948",
    "#b07aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac",
  ];
  communities.forEach((c, i) => communityColor.set(c.id, palette[i % palette.length]!));

  const nodes = Object.values(doc.nodes).map((n) => {
    const cid = n.community != null ? String(n.community) : "";
    return {
      id: n.id,
      label: n.name,
      title: `${n.kind}${n.filePath ? `\n${n.filePath}` : ""}${cid ? `\ncommunity ${cid}` : ""}`,
      group: cid || "none",
      color: communityColor.get(cid) ?? "#999",
    };
  });
  const edges = doc.edges.map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    title: `${e.kind} (${e.confidence})`,
    arrows: "to",
  }));

  const payload = JSON.stringify({ nodes, edges });
  const safeTitle = (title ?? doc.graphId).replace(/</g, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
  <style>
    html, body { margin: 0; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; }
    #meta { padding: 8px 12px; background: #111; color: #eee; font-size: 13px; }
    #graph { height: calc(100% - 36px); }
  </style>
</head>
<body>
  <div id="meta">${safeTitle} — ${doc.nodeCount} nodes / ${doc.edgeCount} edges / ${communities.length} communities (clawql-codegraph)</div>
  <div id="graph"></div>
  <script>
    const data = ${payload};
    const container = document.getElementById('graph');
    const network = new vis.Network(container, data, {
      physics: { stabilization: { iterations: 120 } },
      nodes: { shape: 'dot', size: 8, font: { size: 12 } },
      edges: { color: { color: '#aaa', opacity: 0.5 }, smooth: false }
    });
  </script>
</body>
</html>
`;
}
