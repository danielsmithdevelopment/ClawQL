import { describe, expect, it } from "vitest";
import { extractTypeScriptGraph } from "./extract-typescript.js";
import { linkTypeScriptCrossFile } from "./link-typescript.js";
import { buildAdjacencyFromEdges } from "../import/graph-utils.js";
import { exploreGraph, impactAnalysis } from "../graph/explore.js";
import type { CodeGraphDocument } from "../types.js";

describe("extractTypeScriptGraph (deep TS)", () => {
  it("extracts enclosing-scope calls, extends, exports, and arrow functions", () => {
    const source = `
import { helper } from "./lib.js";

export interface Repo { id: string }
export class Base {}
export class Service extends Base implements Repo {
  id = "1";
  run() {
    helper();
    this.save();
  }
  save() { return 1; }
}

export const load = () => helper();

export function authenticate(user: string): boolean {
  return helper(user);
}
`;
    const result = extractTypeScriptGraph("/tmp/auth.ts", "src/auth.ts", source);
    const byName = Object.fromEntries(result.nodes.map((n) => [n.name, n]));
    expect(byName.authenticate?.kind).toBe("function");
    expect(byName.load?.kind).toBe("function");
    expect(byName.Service?.kind).toBe("class");
    expect(byName.Repo?.kind).toBe("interface");

    expect(result.edges.some((e) => e.kind === "extends" && e.confidence === "EXTRACTED")).toBe(
      true
    );
    expect(result.edges.some((e) => e.kind === "implements")).toBe(true);
    expect(result.edges.some((e) => e.kind === "exports")).toBe(true);

    const authId = byName.authenticate!.id;
    const authCalls = result.edges.filter((e) => e.from === authId && e.kind === "calls");
    expect(authCalls.length).toBeGreaterThan(0);

    const runId = result.nodes.find((n) => n.name === "run")!.id;
    expect(result.edges.some((e) => e.from === runId && e.kind === "calls")).toBe(true);
  });

  it("tags React components and Next app router files", () => {
    const source = `
export function UserCard({ name }: { name: string }) {
  return <div>{name}</div>;
}
`;
    const result = extractTypeScriptGraph(
      "/tmp/page.tsx",
      "src/app/users/page.tsx",
      source
    );
    const file = result.nodes.find((n) => n.kind === "file");
    expect(file?.tags).toContain("next-app-router");
    const card = result.nodes.find((n) => n.name === "UserCard");
    expect(card?.tags).toContain("react-component");
  });
});

describe("linkTypeScriptCrossFile", () => {
  it("resolves relative imports and cross-file calls to unique exports", () => {
    const a = extractTypeScriptGraph(
      "/tmp/a.ts",
      "src/a.ts",
      `export function alpha() { return 1; }\n`
    );
    const b = extractTypeScriptGraph(
      "/tmp/b.ts",
      "src/b.ts",
      `import { alpha } from "./a.js";\nexport function beta() { return alpha(); }\n`
    );
    const nodes = Object.fromEntries([...a.nodes, ...b.nodes].map((n) => [n.id, n]));
    const edges = [...a.edges, ...b.edges];
    const doc: CodeGraphDocument = {
      graphId: "t",
      rootPath: "/tmp",
      builtAt: new Date().toISOString(),
      nodeCount: Object.keys(nodes).length,
      edgeCount: edges.length,
      nodes,
      edges,
      adjacency: buildAdjacencyFromEdges(edges),
    };
    const linked = linkTypeScriptCrossFile(doc);
    expect(
      linked.edges.some(
        (e) =>
          e.kind === "imports" &&
          e.from.includes("b.ts") &&
          e.to.includes("a.ts") &&
          e.confidence === "EXTRACTED"
      )
    ).toBe(true);
    const beta = Object.values(linked.nodes).find((n) => n.name === "beta")!;
    expect(
      linked.edges.some(
        (e) =>
          e.from === beta.id &&
          e.kind === "calls" &&
          linked.nodes[e.to]?.name === "alpha" &&
          e.confidence === "INFERRED"
      )
    ).toBe(true);
  });
});

describe("explore + impact", () => {
  it("returns one-shot agent context and blast radius", () => {
    const a = extractTypeScriptGraph(
      "/tmp/a.ts",
      "src/a.ts",
      `export function core() { return 1; }\n`
    );
    const b = extractTypeScriptGraph(
      "/tmp/b.ts",
      "src/b.ts",
      `import { core } from "./a.js";\nexport function wrapper() { return core(); }\n`
    );
    const nodes = Object.fromEntries([...a.nodes, ...b.nodes].map((n) => [n.id, n]));
    let edges = [...a.edges, ...b.edges];
    let doc: CodeGraphDocument = {
      graphId: "t",
      rootPath: "/tmp",
      builtAt: new Date().toISOString(),
      nodeCount: Object.keys(nodes).length,
      edgeCount: edges.length,
      nodes,
      edges,
      adjacency: buildAdjacencyFromEdges(edges),
    };
    doc = linkTypeScriptCrossFile(doc);

    const explored = exploreGraph(doc, "core");
    expect(explored.primary?.node.name).toBe("core");
    expect(explored.guidance.length).toBeGreaterThan(0);

    const impact = impactAnalysis(doc, "core", 2);
    expect(impact.impacted.some((h) => h.name === "wrapper")).toBe(true);
  });
});
