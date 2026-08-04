import ts from "typescript";
import type { CodeGraphEdge, CodeGraphEdgeConfidence, CodeGraphNode } from "../types.js";

export type TypeScriptExtractResult = {
  readonly nodes: CodeGraphNode[];
  readonly edges: CodeGraphEdge[];
};

export function nodeId(filePath: string, kind: string, name: string, line?: number): string {
  const suffix = line !== undefined ? `#L${line}` : "";
  return `${filePath}::${kind}::${name}${suffix}`;
}

export function fileNodeId(filePath: string): string {
  return `${filePath}::file`;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false)).line + 1;
}

function endLineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
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

function paramSignature(params: ts.NodeArray<ts.ParameterDeclaration> | undefined): string {
  if (!params?.length) return "()";
  const parts = params.map((p) => {
    const name = ts.isIdentifier(p.name) ? p.name.text : "?";
    const ty = p.type ? `: ${p.type.getText()}` : "";
    return `${name}${ty}`;
  });
  return `(${parts.join(", ")})`;
}

function isJsxLike(node: ts.Node): boolean {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node) ||
    (ts.isParenthesizedExpression(node) && isJsxLike(node.expression)) ||
    (ts.isReturnStatement(node) && node.expression != null && isJsxLike(node.expression))
  );
}

function bodyHasJsx(node: ts.Node | undefined): boolean {
  if (!node) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (isJsxLike(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function frameworkTagsForFile(relFilePath: string): string[] {
  const base = relFilePath.split("/").pop()?.toLowerCase() ?? "";
  const tags: string[] = [];
  if (
    base === "page.tsx" ||
    base === "page.jsx" ||
    base === "page.ts" ||
    base === "page.js" ||
    base === "layout.tsx" ||
    base === "layout.jsx" ||
    base === "route.ts" ||
    base === "route.js" ||
    base === "loading.tsx" ||
    base === "error.tsx" ||
    base === "template.tsx"
  ) {
    tags.push("next-app-router");
  }
  if (relFilePath.includes("/app/") || relFilePath.includes("/src/app/")) {
    tags.push("next-app-dir");
  }
  if (relFilePath.includes("/pages/") && (base.endsWith(".tsx") || base.endsWith(".jsx"))) {
    tags.push("next-pages-router");
  }
  return tags;
}

function uniquePush(edges: CodeGraphEdge[], edge: CodeGraphEdge): void {
  if (
    edges.some(
      (e) =>
        e.from === edge.from &&
        e.to === edge.to &&
        e.kind === edge.kind &&
        e.confidence === edge.confidence
    )
  ) {
    return;
  }
  edges.push(edge);
}

type ScopeFrame = { id: string; name: string };

/** Parse a TypeScript/JavaScript file into structural graph nodes and edges. */
export function extractTypeScriptGraph(
  absPath: string,
  relFilePath: string,
  content: string
): TypeScriptExtractResult {
  const scriptKind = absPath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : absPath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : absPath.endsWith(".js") || absPath.endsWith(".mjs") || absPath.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const fileTags = frameworkTagsForFile(relFilePath);
  const fileId = fileNodeId(relFilePath);
  const nodes: CodeGraphNode[] = [
    {
      id: fileId,
      kind: "file",
      name: relFilePath,
      filePath: relFilePath,
      tags: fileTags.length ? fileTags : undefined,
    },
  ];
  const edges: CodeGraphEdge[] = [];
  /** Local name → preferred symbol id (first wins for simple lookup). */
  const symbolByName = new Map<string, string>();
  /** Exported local names. */
  const exportedNames = new Set<string>();

  const register = (node: CodeGraphNode, alsoName?: string): void => {
    nodes.push(node);
    symbolByName.set(alsoName ?? node.name, node.id);
    uniquePush(edges, { from: fileId, to: node.id, kind: "contains", confidence: "EXTRACTED" });
  };

  const line = (n: ts.Node) => lineOf(sourceFile, n);

  const registerFunctionLike = (
    name: string,
    node: ts.Node,
    params: ts.NodeArray<ts.ParameterDeclaration> | undefined,
    body: ts.Node | undefined,
    kind: "function" | "method" = "function"
  ): string => {
    const id = nodeId(relFilePath, kind, name, line(node));
    const tags: string[] = [];
    if (/^[A-Z]/.test(name) && bodyHasJsx(body)) tags.push("react-component");
    register({
      id,
      kind,
      name,
      filePath: relFilePath,
      startLine: line(node),
      endLine: endLineOf(sourceFile, node),
      signature: `${name}${paramSignature(params)}`,
      docComment: getLeadingDoc(node, sourceFile),
      tags: tags.length ? tags : undefined,
    });
    return id;
  };

  const scopeStack: ScopeFrame[] = [{ id: fileId, name: relFilePath }];
  const currentScope = () => scopeStack[scopeStack.length - 1]!;

  const resolveLocal = (name: string): { id: string; confidence: CodeGraphEdgeConfidence } | null => {
    const id = symbolByName.get(name);
    if (id) return { id, confidence: "EXTRACTED" };
    return null;
  };

  const addCall = (calleeName: string, fromId: string): void => {
    const local = resolveLocal(calleeName);
    if (local) {
      uniquePush(edges, { from: fromId, to: local.id, kind: "calls", confidence: local.confidence });
      return;
    }
    uniquePush(edges, {
      from: fromId,
      to: `unresolved::${calleeName}`,
      kind: "calls",
      confidence: "AMBIGUOUS",
    });
  };

  const visitHeritage = (node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration, fromId: string): void => {
    if (!node.heritageClauses) return;
    for (const clause of node.heritageClauses) {
      const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
      for (const typeNode of clause.types) {
        const expr = typeNode.expression;
        const name = ts.isIdentifier(expr)
          ? expr.text
          : ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)
            ? expr.name.text
            : typeNode.getText(sourceFile);
        const local = resolveLocal(name);
        if (local) {
          uniquePush(edges, { from: fromId, to: local.id, kind, confidence: "EXTRACTED" });
        } else {
          const stubId = `unresolved::${name}`;
          uniquePush(edges, { from: fromId, to: stubId, kind, confidence: "INFERRED" });
        }
      }
    }
  };

  const visit = (node: ts.Node): void => {
    // Imports
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const targetId = `${spec}::module`;
      uniquePush(edges, { from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
      const clause = node.importClause;
      if (clause?.name) {
        // default import alias — reference to module
        uniquePush(edges, {
          from: fileId,
          to: targetId,
          kind: "references",
          confidence: "EXTRACTED",
        });
      }
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const localName = el.name.text;
          symbolByName.set(localName, `import::${relFilePath}::${localName}`);
          register({
            id: `import::${relFilePath}::${localName}`,
            kind: "variable",
            name: localName,
            filePath: relFilePath,
            startLine: line(el),
            endLine: line(el),
            signature: `import { ${localName} } from "${spec}"`,
            tags: ["import-binding"],
          });
          uniquePush(edges, {
            from: `import::${relFilePath}::${localName}`,
            to: targetId,
            kind: "references",
            confidence: "EXTRACTED",
          });
        }
      }
    }

    // Re-exports / export from
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        const targetId = `${spec}::module`;
        uniquePush(edges, { from: fileId, to: targetId, kind: "exports", confidence: "EXTRACTED" });
        uniquePush(edges, { from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exportedNames.add(el.name.text);
          const local = resolveLocal(el.name.text);
          if (local) {
            uniquePush(edges, {
              from: fileId,
              to: local.id,
              kind: "exports",
              confidence: "EXTRACTED",
            });
          }
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const id = registerFunctionLike(node.name.text, node, node.parameters, node.body, "function");
      const isExport = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (isExport) {
        exportedNames.add(node.name.text);
        uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
      }
      if (isDefault) {
        const idx = nodes.findIndex((n) => n.id === id);
        if (idx >= 0) {
          nodes[idx] = {
            ...nodes[idx]!,
            tags: [...new Set([...(nodes[idx]!.tags ?? []), "default-export"])],
          };
        }
      }
      scopeStack.push({ id, name: node.name.text });
      ts.forEachChild(node, visit);
      scopeStack.pop();
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const id = nodeId(relFilePath, "class", node.name.text, line(node));
      const tags: string[] = [];
      if (bodyHasJsx(node)) tags.push("react-component");
      register({
        id,
        kind: "class",
        name: node.name.text,
        filePath: relFilePath,
        startLine: line(node),
        endLine: endLineOf(sourceFile, node),
        signature: `class ${node.name.text}`,
        docComment: getLeadingDoc(node, sourceFile),
        tags: tags.length ? tags : undefined,
      });
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        exportedNames.add(node.name.text);
        uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
      }
      visitHeritage(node, id);
      scopeStack.push({ id, name: node.name.text });
      ts.forEachChild(node, visit);
      scopeStack.pop();
      return;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const id = registerFunctionLike(node.name.text, node, node.parameters, node.body, "method");
      // contain under class if present
      const parent = scopeStack.length > 1 ? scopeStack[scopeStack.length - 1] : null;
      if (parent && parent.id !== fileId) {
        uniquePush(edges, { from: parent.id, to: id, kind: "contains", confidence: "EXTRACTED" });
      }
      scopeStack.push({ id, name: node.name.text });
      ts.forEachChild(node, visit);
      scopeStack.pop();
      return;
    }

    if (ts.isConstructorDeclaration(node)) {
      const parent = currentScope();
      const id = nodeId(relFilePath, "method", "constructor", line(node));
      register({
        id,
        kind: "method",
        name: "constructor",
        filePath: relFilePath,
        startLine: line(node),
        endLine: endLineOf(sourceFile, node),
        signature: `constructor${paramSignature(node.parameters)}`,
      });
      if (parent.id !== fileId) {
        uniquePush(edges, { from: parent.id, to: id, kind: "contains", confidence: "EXTRACTED" });
      }
      scopeStack.push({ id, name: "constructor" });
      ts.forEachChild(node, visit);
      scopeStack.pop();
      return;
    }

    if (ts.isInterfaceDeclaration(node)) {
      const id = nodeId(relFilePath, "interface", node.name.text, line(node));
      register({
        id,
        kind: "interface",
        name: node.name.text,
        filePath: relFilePath,
        startLine: line(node),
        endLine: endLineOf(sourceFile, node),
        signature: `interface ${node.name.text}`,
        docComment: getLeadingDoc(node, sourceFile),
      });
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        exportedNames.add(node.name.text);
        uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
      }
      visitHeritage(node, id);
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const id = nodeId(relFilePath, "type", node.name.text, line(node));
      register({
        id,
        kind: "type",
        name: node.name.text,
        filePath: relFilePath,
        startLine: line(node),
        endLine: endLineOf(sourceFile, node),
        signature: `type ${node.name.text}`,
        docComment: getLeadingDoc(node, sourceFile),
      });
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        exportedNames.add(node.name.text);
        uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
      }
      ts.forEachChild(node, visit);
      return;
    }

    // const foo = () => {} / function expressions / React components
    if (ts.isVariableStatement(node)) {
      const isExport = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          const id = registerFunctionLike(name, decl, init.parameters, init.body, "function");
          if (isExport) {
            exportedNames.add(name);
            uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
          }
          scopeStack.push({ id, name });
          ts.forEachChild(init, visit);
          scopeStack.pop();
          continue;
        }
        const id = nodeId(relFilePath, "variable", name, line(decl));
        register({
          id,
          kind: "variable",
          name,
          filePath: relFilePath,
          startLine: line(decl),
          endLine: endLineOf(sourceFile, decl),
        });
        if (isExport) {
          exportedNames.add(name);
          uniquePush(edges, { from: fileId, to: id, kind: "exports", confidence: "EXTRACTED" });
        }
      }
    }

    // Calls: foo(), obj.method(), new Foo()
    if (ts.isCallExpression(node)) {
      const fromId = currentScope().id;
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        addCall(expr.text, fromId);
      } else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
        addCall(expr.name.text, fromId);
      }
    }

    if (ts.isNewExpression(node) && node.expression) {
      const fromId = currentScope().id;
      const expr = node.expression;
      if (ts.isIdentifier(expr)) addCall(expr.text, fromId);
      else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
        addCall(expr.name.text, fromId);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Stub nodes for unresolved targets
  const extraNodes: CodeGraphNode[] = [];
  const seen = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!seen.has(edge.to)) {
      if (edge.to.endsWith("::module")) {
        extraNodes.push({
          id: edge.to,
          kind: "module",
          name: edge.to.replace(/::module$/, ""),
          tags: ["import-spec"],
        });
      } else if (edge.to.startsWith("unresolved::")) {
        extraNodes.push({
          id: edge.to,
          kind: "function",
          name: edge.to.replace(/^unresolved::/, ""),
          tags: ["unresolved"],
        });
      }
      seen.add(edge.to);
    }
  }

  // Mark exported symbols with tag
  for (const n of nodes) {
    if (exportedNames.has(n.name) && n.kind !== "file") {
      const idx = nodes.findIndex((x) => x.id === n.id);
      if (idx >= 0) {
        const tags = new Set([...(nodes[idx]!.tags ?? []), "exported"]);
        nodes[idx] = { ...nodes[idx]!, tags: [...tags] };
      }
    }
  }

  return { nodes: [...nodes, ...extraNodes], edges };
}

/** @internal test helper */
export function collectIdentifiers(
  sourceFile: ts.SourceFile,
  scopeStart: number,
  scopeEnd: number
): Set<string> {
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
