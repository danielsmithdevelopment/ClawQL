import ts from "typescript";
import type { CodeGraphEdge, CodeGraphNode } from "../types.js";

export type TypeScriptExtractResult = {
  readonly nodes: CodeGraphNode[];
  readonly edges: CodeGraphEdge[];
};

function nodeId(filePath: string, kind: string, name: string, line?: number): string {
  const suffix = line !== undefined ? `#L${line}` : "";
  return `${filePath}::${kind}::${name}${suffix}`;
}

function fileNodeId(filePath: string): string {
  return `${filePath}::file`;
}

function getLeadingDoc(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart());
  if (!ranges?.length) return undefined;
  const parts = ranges.map((r) => sourceFile.text.slice(r.pos, r.end).trim());
  const joined = parts.join("\n");
  const cleaned = joined
    .replace(/^\/\*\*?\s?|\*\/$/g, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim();
  return cleaned || undefined;
}

function collectIdentifiers(sourceFile: ts.SourceFile, scopeStart: number, scopeEnd: number): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node.pos >= scopeEnd) return;
    if (node.end <= scopeStart) return;
    if (ts.isIdentifier(node) && node.parent && !ts.isPropertyAccessExpression(node.parent)) {
      ids.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ids;
}

function symbolNodesInFile(
  sourceFile: ts.SourceFile,
  relFilePath: string
): { nodes: CodeGraphNode[]; symbolIds: Map<string, string> } {
  const nodes: CodeGraphNode[] = [];
  const symbolIds = new Map<string, string>();

  const fileId = fileNodeId(relFilePath);
  nodes.push({ id: fileId, kind: "file", name: relFilePath, filePath: relFilePath });

  const register = (node: CodeGraphNode): void => {
    nodes.push(node);
    symbolIds.set(node.name, node.id);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const id = nodeId(relFilePath, "function", node.name.text, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      register({
        id,
        kind: "function",
        name: node.name.text,
        filePath: relFilePath,
        startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        signature: node.name.text,
        docComment: getLeadingDoc(node, sourceFile),
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      const id = nodeId(relFilePath, "class", node.name.text, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      register({
        id,
        kind: "class",
        name: node.name.text,
        filePath: relFilePath,
        startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        docComment: getLeadingDoc(node, sourceFile),
      });
    } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const id = nodeId(relFilePath, "method", node.name.text, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      register({
        id,
        kind: "method",
        name: node.name.text,
        filePath: relFilePath,
        startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        docComment: getLeadingDoc(node, sourceFile),
      });
    } else if (ts.isInterfaceDeclaration(node)) {
      const id = nodeId(relFilePath, "interface", node.name.text, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      register({
        id,
        kind: "interface",
        name: node.name.text,
        filePath: relFilePath,
        startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        docComment: getLeadingDoc(node, sourceFile),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      const id = nodeId(relFilePath, "type", node.name.text, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      register({
        id,
        kind: "type",
        name: node.name.text,
        filePath: relFilePath,
        startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        docComment: getLeadingDoc(node, sourceFile),
      });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const id = nodeId(relFilePath, "variable", decl.name.text, sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1);
          register({
            id,
            kind: "variable",
            name: decl.name.text,
            filePath: relFilePath,
            startLine: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
            endLine: sourceFile.getLineAndCharacterOfPosition(decl.getEnd()).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { nodes, symbolIds };
}

function extractImports(sourceFile: ts.SourceFile, relFilePath: string, fileId: string): CodeGraphEdge[] {
  const edges: CodeGraphEdge[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) {
      continue;
    }
    const spec = stmt.moduleSpecifier.text;
    const targetId = `${spec}::module`;
    edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
  }
  return edges;
}

function extractCalls(
  sourceFile: ts.SourceFile,
  relFilePath: string,
  symbolIds: Map<string, string>
): CodeGraphEdge[] {
  const edges: CodeGraphEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const fromSymbols = [...symbolIds.entries()];
      // Attach call to the nearest enclosing symbol by line — simplified: file-level inference
      const callerId = fileNodeId(relFilePath);
      const targetId = symbolIds.get(callee);
      if (targetId) {
        edges.push({ from: callerId, to: targetId, kind: "calls", confidence: "INFERRED" });
      } else {
        edges.push({
          from: callerId,
          to: `unresolved::${callee}`,
          kind: "calls",
          confidence: "AMBIGUOUS",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edges;
}

function containsEdges(nodes: CodeGraphNode[], fileId: string): CodeGraphEdge[] {
  return nodes
    .filter((n) => n.id !== fileId)
    .map((n) => ({ from: fileId, to: n.id, kind: "contains" as const, confidence: "EXTRACTED" as const }));
}

/** Parse a TypeScript/JavaScript file into structural graph nodes and edges. */
export function extractTypeScriptGraph(absPath: string, relFilePath: string, content: string): TypeScriptExtractResult {
  const scriptKind = absPath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : absPath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : absPath.endsWith(".js") || absPath.endsWith(".mjs") || absPath.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const { nodes, symbolIds } = symbolNodesInFile(sourceFile, relFilePath);
  const fileId = fileNodeId(relFilePath);
  const edges: CodeGraphEdge[] = [
    ...containsEdges(nodes, fileId),
    ...extractImports(sourceFile, relFilePath, fileId),
    ...extractCalls(sourceFile, relFilePath, symbolIds),
  ];

  // Ensure import target module nodes exist
  const extraNodes: CodeGraphNode[] = [];
  for (const edge of edges) {
    if (edge.kind === "imports" && edge.to.endsWith("::module")) {
      const modName = edge.to.replace(/::module$/, "");
      extraNodes.push({ id: edge.to, kind: "module", name: modName });
    }
    if (edge.kind === "calls" && edge.to.startsWith("unresolved::")) {
      extraNodes.push({
        id: edge.to,
        kind: "function",
        name: edge.to.replace(/^unresolved::/, ""),
      });
    }
  }

  return { nodes: [...nodes, ...extraNodes], edges };
}

export { collectIdentifiers, nodeId, fileNodeId };
