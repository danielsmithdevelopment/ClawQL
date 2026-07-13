import { createRequire } from "node:module";
import path from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { CodeGraphEdge, CodeGraphNode } from "../types.js";
import { fileNodeId } from "./extract-typescript.js";

const require = createRequire(import.meta.url);

export type TreeSitterExtractResult = {
  readonly nodes: CodeGraphNode[];
  readonly edges: CodeGraphEdge[];
};

type LanguageName = "python" | "go";

let parserInit: Promise<void> | null = null;
const languageCache = new Map<LanguageName, Language>();

async function ensureParser(): Promise<void> {
  if (!parserInit) {
    parserInit = Parser.init();
  }
  await parserInit;
}

function wasmPath(lang: LanguageName): string {
  const pkgRoot = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const file = lang === "python" ? "tree-sitter-python.wasm" : "tree-sitter-go.wasm";
  return path.join(pkgRoot, "out", file);
}

async function getLanguage(lang: LanguageName): Promise<Language> {
  await ensureParser();
  const cached = languageCache.get(lang);
  if (cached) return cached;
  const language = await Language.load(wasmPath(lang));
  languageCache.set(lang, language);
  return language;
}

function childName(node: Node): string | undefined {
  for (const c of node.children) {
    if (!c) continue;
    if (c.type === "identifier" || c.type === "type_identifier" || c.type === "field_identifier") {
      return c.text;
    }
  }
  return node.childForFieldName("name")?.text;
}

function walkCalls(
  node: Node,
  relFilePath: string,
  fileId: string,
  symbolIds: Map<string, string>,
  edges: CodeGraphEdge[]
): void {
  if (node.type === "call" || node.type === "call_expression") {
    const callee = node.childForFieldName("function") ?? node.namedChild(0);
    const name =
      callee?.type === "identifier" || callee?.type === "field_identifier"
        ? callee.text
        : callee?.childForFieldName("name")?.text;
    if (name) {
      const target = symbolIds.get(name);
      edges.push({
        from: fileId,
        to: target ?? `unresolved::${name}`,
        kind: "calls",
        confidence: target ? "INFERRED" : "AMBIGUOUS",
      });
    }
  }
  for (const child of node.children) {
    if (child) walkCalls(child, relFilePath, fileId, symbolIds, edges);
  }
}

function registerSymbol(
  nodes: CodeGraphNode[],
  symbolIds: Map<string, string>,
  relFilePath: string,
  kind: CodeGraphNode["kind"],
  name: string,
  startLine: number
): void {
  const id = `${relFilePath}::${kind}::${name}#L${startLine}`;
  const node: CodeGraphNode = {
    id,
    kind,
    name,
    filePath: relFilePath,
    startLine,
  };
  nodes.push(node);
  symbolIds.set(name, id);
}

function extractPythonNodes(_source: string, relFilePath: string, root: Node): TreeSitterExtractResult {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const symbolIds = new Map<string, string>();
  const fileId = fileNodeId(relFilePath);
  nodes.push({ id: fileId, kind: "file", name: relFilePath, filePath: relFilePath });

  const visit = (node: Node): void => {
    const line = node.startPosition.row + 1;
    if (node.type === "function_definition") {
      const name = childName(node);
      if (name) registerSymbol(nodes, symbolIds, relFilePath, "function", name, line);
    } else if (node.type === "class_definition") {
      const name = childName(node);
      if (name) registerSymbol(nodes, symbolIds, relFilePath, "class", name, line);
    } else if (node.type === "import_statement" || node.type === "import_from_statement") {
      const mod = node.text.replace(/\s+/g, " ").slice(0, 120);
      const targetId = `${mod}::module`;
      edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
      nodes.push({ id: targetId, kind: "module", name: mod });
    }
    for (const child of node.children) {
      if (child) visit(child);
    }
  };
  visit(root);
  walkCalls(root, relFilePath, fileId, symbolIds, edges);
  for (const n of nodes) {
    if (n.id !== fileId) {
      edges.push({ from: fileId, to: n.id, kind: "contains", confidence: "EXTRACTED" });
    }
  }
  for (const e of edges) {
    if (e.to.startsWith("unresolved::")) {
      nodes.push({ id: e.to, kind: "function", name: e.to.replace(/^unresolved::/, "") });
    }
  }
  return { nodes, edges };
}

function extractGoNodes(_source: string, relFilePath: string, root: Node): TreeSitterExtractResult {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const symbolIds = new Map<string, string>();
  const fileId = fileNodeId(relFilePath);
  nodes.push({ id: fileId, kind: "file", name: relFilePath, filePath: relFilePath });

  const visit = (node: Node): void => {
    const line = node.startPosition.row + 1;
    if (node.type === "function_declaration" || node.type === "method_declaration") {
      const name = childName(node);
      if (name) {
        registerSymbol(
          nodes,
          symbolIds,
          relFilePath,
          node.type === "method_declaration" ? "method" : "function",
          name,
          line
        );
      }
    } else if (node.type === "type_declaration") {
      const name = childName(node);
      if (name) registerSymbol(nodes, symbolIds, relFilePath, "type", name, line);
    } else if (node.type === "import_declaration") {
      const mod = node.text.replace(/\s+/g, " ").slice(0, 120);
      const targetId = `${mod}::module`;
      edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
      nodes.push({ id: targetId, kind: "module", name: mod });
    }
    for (const child of node.children) {
      if (child) visit(child);
    }
  };
  visit(root);
  walkCalls(root, relFilePath, fileId, symbolIds, edges);
  for (const n of nodes) {
    if (n.id !== fileId) {
      edges.push({ from: fileId, to: n.id, kind: "contains", confidence: "EXTRACTED" });
    }
  }
  for (const e of edges) {
    if (e.to.startsWith("unresolved::")) {
      nodes.push({ id: e.to, kind: "function", name: e.to.replace(/^unresolved::/, "") });
    }
  }
  return { nodes, edges };
}

export async function extractWithTreeSitter(
  lang: LanguageName,
  relFilePath: string,
  content: string
): Promise<TreeSitterExtractResult> {
  const language = await getLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(content);
  if (!tree) throw new Error(`tree-sitter failed to parse ${relFilePath}`);
  if (lang === "python") return extractPythonNodes(content, relFilePath, tree.rootNode);
  return extractGoNodes(content, relFilePath, tree.rootNode);
}

export function treeSitterAvailable(): boolean {
  try {
    require.resolve("tree-sitter-wasms/package.json");
    return true;
  } catch {
    return false;
  }
}
