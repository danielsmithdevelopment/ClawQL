import path from "node:path";
import type { CodeGraphDocument, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { buildAdjacencyFromEdges } from "../import/graph-utils.js";
import { fileNodeId } from "./extract-typescript.js";

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripExt(p: string): string {
  return p.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "");
}

/**
 * Resolve relative import specs to file nodes and promote AMBIGUOUS calls to
 * INFERRED/EXTRACTED when a unique exported symbol exists elsewhere.
 */
export function linkTypeScriptCrossFile(doc: CodeGraphDocument): CodeGraphDocument {
  const nodes: Record<string, CodeGraphNode> = { ...doc.nodes };
  const edges: CodeGraphEdge[] = [...doc.edges];

  const filesByPath = new Map<string, string>();
  const filesByStem = new Map<string, string[]>();
  for (const node of Object.values(nodes)) {
    if (node.kind !== "file" || !node.filePath) continue;
    const rel = normalizeRel(node.filePath);
    filesByPath.set(rel, node.id);
    filesByPath.set(stripExt(rel), node.id);
    const stem = stripExt(path.posix.basename(rel));
    const list = filesByStem.get(stem) ?? [];
    list.push(node.id);
    filesByStem.set(stem, list);
  }

  const exportsByName = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "exports") continue;
    const target = nodes[edge.to];
    if (!target || target.kind === "file" || target.kind === "module") continue;
    const list = exportsByName.get(target.name) ?? [];
    list.push(target.id);
    exportsByName.set(target.name, list);
  }
  // Also treat tags:exported
  for (const node of Object.values(nodes)) {
    if (node.tags?.includes("exported")) {
      const list = exportsByName.get(node.name) ?? [];
      if (!list.includes(node.id)) list.push(node.id);
      exportsByName.set(node.name, list);
    }
  }

  const resolveImportSpec = (fromFile: string, spec: string): string | null => {
    if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // package import
    const fromDir = path.posix.dirname(normalizeRel(fromFile));
    const joined = normalizeRel(path.posix.normalize(path.posix.join(fromDir, spec)));
    const candidates = [
      joined,
      stripExt(joined),
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}.js`,
      `${joined}.jsx`,
      `${joined}.mjs`,
      `${joined}.cjs`,
      `${joined}/index.ts`,
      `${joined}/index.tsx`,
      `${joined}/index.js`,
    ];
    for (const c of candidates) {
      const hit = filesByPath.get(normalizeRel(c)) ?? filesByPath.get(stripExt(normalizeRel(c)));
      if (hit) return hit;
    }
    return null;
  };

  const fileOfNode = (nodeId: string): string | undefined => nodes[nodeId]?.filePath;

  const rewritten: CodeGraphEdge[] = [];
  for (const edge of edges) {
    if (edge.kind === "imports" && edge.to.endsWith("::module")) {
      const spec = edge.to.replace(/::module$/, "");
      const fromPath = fileOfNode(edge.from);
      if (fromPath) {
        const resolved = resolveImportSpec(fromPath, spec);
        if (resolved) {
          rewritten.push({
            from: edge.from,
            to: resolved,
            kind: "imports",
            confidence: "EXTRACTED",
          });
          continue;
        }
      }
    }

    // Calls to import bindings → resolve to exported symbol in the imported file
    if (edge.kind === "calls") {
      const target = nodes[edge.to];
      if (target?.tags?.includes("import-binding") && target.filePath) {
        const ref = edges.find(
          (e) => e.from === edge.to && e.kind === "references" && e.to.endsWith("::module")
        );
        const spec = ref?.to.replace(/::module$/, "");
        const importedFile = spec ? resolveImportSpec(target.filePath, spec) : null;
        if (importedFile) {
          const inFile = (exportsByName.get(target.name) ?? []).filter((id) => {
            const fp = nodes[id]?.filePath;
            return fp != null && fileNodeId(fp) === importedFile;
          });
          if (inFile.length === 1) {
            rewritten.push({
              from: edge.from,
              to: inFile[0]!,
              kind: "calls",
              confidence: "INFERRED",
            });
            continue;
          }
        }
      }
    }

    if (edge.kind === "calls" && edge.to.startsWith("unresolved::")) {
      const name = edge.to.replace(/^unresolved::/, "");
      const candidates = exportsByName.get(name) ?? [];
      const fromFile = fileOfNode(edge.from);
      const remote = candidates.filter((id) => nodes[id]?.filePath !== fromFile);
      if (remote.length === 1) {
        rewritten.push({
          from: edge.from,
          to: remote[0]!,
          kind: "calls",
          confidence: "INFERRED",
        });
        continue;
      }
      if (remote.length > 1) {
        const callerFileId = fromFile ? fileNodeId(fromFile) : null;
        const viaResolved = remote.filter((id) => {
          const fp = nodes[id]?.filePath;
          if (!fp || !callerFileId) return false;
          return edges.some(
            (e) =>
              e.kind === "imports" &&
              e.from === callerFileId &&
              (e.to === fileNodeId(fp) || nodes[e.to]?.filePath === fp)
          );
        });
        if (viaResolved.length === 1) {
          rewritten.push({
            from: edge.from,
            to: viaResolved[0]!,
            kind: "calls",
            confidence: "INFERRED",
          });
          continue;
        }
      }
    }

    rewritten.push(edge);
  }

  // Ensure file nodes exist for any resolved targets
  for (const e of rewritten) {
    if (!nodes[e.to] && e.to.endsWith("::file")) {
      const fp = e.to.replace(/::file$/, "");
      nodes[e.to] = { id: e.to, kind: "file", name: fp, filePath: fp };
    }
  }

  return {
    ...doc,
    nodes,
    edges: rewritten,
    nodeCount: Object.keys(nodes).length,
    edgeCount: rewritten.length,
    adjacency: buildAdjacencyFromEdges(rewritten),
    builtAt: new Date().toISOString(),
  };
}
