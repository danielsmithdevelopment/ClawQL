import { existsSync } from "node:fs";
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

/**
 * Languages with a tree-sitter WASM grammar. TS/JS still prefer the compiler API;
 * these ids are used for everything else (and as a TS/JS fallback).
 *
 * Grammar WASMs: prefer `@vscode/tree-sitter-wasm` (ABI-matched to web-tree-sitter
 * ≥0.26); fall back to `tree-sitter-wasms` for languages VS Code does not ship.
 */
export type TreeSitterLanguageId =
  | "python"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp"
  | "c_sharp"
  | "ruby"
  | "kotlin"
  | "scala"
  | "php"
  | "swift"
  | "lua"
  | "zig"
  | "elixir"
  | "objc"
  | "bash"
  | "dart"
  | "javascript"
  | "typescript"
  | "tsx"
  | "json"
  | "yaml"
  | "toml"
  | "html"
  | "css"
  | "vue"
  | "solidity"
  | "ocaml"
  | "elm"
  | "rescript"
  | "ql"
  | "elisp";

type LangProfile = {
  readonly id: TreeSitterLanguageId;
  readonly wasm: string;
  readonly extensions: readonly string[];
  readonly functionTypes: ReadonlySet<string>;
  readonly classTypes: ReadonlySet<string>;
  readonly methodTypes: ReadonlySet<string>;
  readonly typeTypes: ReadonlySet<string>;
  readonly interfaceTypes: ReadonlySet<string>;
  readonly importTypes: ReadonlySet<string>;
  readonly callTypes: ReadonlySet<string>;
};

function set(...types: string[]): ReadonlySet<string> {
  return new Set(types);
}

/** Declarative AST node-type maps — good-enough structural extraction across grammars. */
const PROFILES: readonly LangProfile[] = [
  {
    id: "python",
    wasm: "tree-sitter-python.wasm",
    extensions: [".py", ".pyi"],
    functionTypes: set("function_definition"),
    classTypes: set("class_definition"),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("import_statement", "import_from_statement"),
    callTypes: set("call"),
  },
  {
    id: "go",
    wasm: "tree-sitter-go.wasm",
    extensions: [".go"],
    functionTypes: set("function_declaration"),
    classTypes: set(),
    methodTypes: set("method_declaration"),
    typeTypes: set("type_declaration", "type_spec"),
    interfaceTypes: set("interface_type"),
    importTypes: set("import_declaration", "import_spec"),
    callTypes: set("call_expression"),
  },
  {
    id: "rust",
    wasm: "tree-sitter-rust.wasm",
    extensions: [".rs"],
    functionTypes: set("function_item"),
    classTypes: set("struct_item", "enum_item", "union_item"),
    methodTypes: set("function_item"), // inherent/impl methods share type; still useful
    typeTypes: set("type_item", "type_alias"),
    interfaceTypes: set("trait_item"),
    importTypes: set("use_declaration", "extern_crate_declaration"),
    callTypes: set("call_expression"),
  },
  {
    id: "java",
    wasm: "tree-sitter-java.wasm",
    extensions: [".java"],
    functionTypes: set("method_declaration", "constructor_declaration"),
    classTypes: set("class_declaration", "enum_declaration", "record_declaration"),
    methodTypes: set("method_declaration"),
    typeTypes: set(),
    interfaceTypes: set("interface_declaration", "annotation_type_declaration"),
    importTypes: set("import_declaration"),
    callTypes: set("method_invocation", "object_creation_expression"),
  },
  {
    id: "c",
    wasm: "tree-sitter-c.wasm",
    extensions: [".c", ".h"],
    functionTypes: set("function_definition"),
    classTypes: set("struct_specifier", "union_specifier", "enum_specifier"),
    methodTypes: set(),
    typeTypes: set("type_definition"),
    interfaceTypes: set(),
    importTypes: set("preproc_include"),
    callTypes: set("call_expression"),
  },
  {
    id: "cpp",
    wasm: "tree-sitter-cpp.wasm",
    extensions: [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"],
    functionTypes: set("function_definition"),
    classTypes: set("class_specifier", "struct_specifier", "union_specifier", "enum_specifier"),
    methodTypes: set("function_definition"),
    typeTypes: set("type_definition", "alias_declaration"),
    interfaceTypes: set(),
    importTypes: set("preproc_include", "using_declaration"),
    callTypes: set("call_expression"),
  },
  {
    id: "c_sharp",
    wasm: "tree-sitter-c_sharp.wasm",
    extensions: [".cs"],
    functionTypes: set("method_declaration", "constructor_declaration", "local_function_statement"),
    classTypes: set("class_declaration", "struct_declaration", "record_declaration", "enum_declaration"),
    methodTypes: set("method_declaration"),
    typeTypes: set("delegate_declaration"),
    interfaceTypes: set("interface_declaration"),
    importTypes: set("using_directive"),
    callTypes: set("invocation_expression", "object_creation_expression"),
  },
  {
    id: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    extensions: [".rb", ".rake"],
    functionTypes: set("method", "singleton_method"),
    classTypes: set("class", "module"),
    methodTypes: set("method"),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("call"), // require/include often look like calls; also:
    callTypes: set("call"),
  },
  {
    id: "kotlin",
    wasm: "tree-sitter-kotlin.wasm",
    extensions: [".kt", ".kts"],
    functionTypes: set("function_declaration"),
    classTypes: set("class_declaration", "object_declaration", "enum_class"),
    methodTypes: set("function_declaration"),
    typeTypes: set("type_alias"),
    interfaceTypes: set("class_declaration"), // interfaces share class_declaration with modifier
    importTypes: set("import_header"),
    callTypes: set("call_expression"),
  },
  {
    id: "scala",
    wasm: "tree-sitter-scala.wasm",
    extensions: [".scala", ".sc"],
    functionTypes: set("function_definition", "function_declaration"),
    classTypes: set("class_definition", "object_definition", "enum_definition"),
    methodTypes: set("function_definition"),
    typeTypes: set("type_definition"),
    interfaceTypes: set("trait_definition"),
    importTypes: set("import_declaration"),
    callTypes: set("call_expression"),
  },
  {
    id: "php",
    wasm: "tree-sitter-php.wasm",
    extensions: [".php"],
    functionTypes: set("function_definition", "method_declaration"),
    classTypes: set("class_declaration", "enum_declaration", "trait_declaration"),
    methodTypes: set("method_declaration"),
    typeTypes: set(),
    interfaceTypes: set("interface_declaration"),
    importTypes: set("namespace_use_declaration", "include_expression", "require_expression"),
    callTypes: set("function_call_expression", "member_call_expression", "scoped_call_expression"),
  },
  {
    id: "swift",
    wasm: "tree-sitter-swift.wasm",
    extensions: [".swift"],
    functionTypes: set("function_declaration"),
    classTypes: set("class_declaration", "struct_declaration", "enum_declaration", "actor_declaration"),
    methodTypes: set("function_declaration"),
    typeTypes: set("typealias_declaration"),
    interfaceTypes: set("protocol_declaration"),
    importTypes: set("import_declaration"),
    callTypes: set("call_expression"),
  },
  {
    id: "lua",
    wasm: "tree-sitter-lua.wasm",
    extensions: [".lua"],
    functionTypes: set("function_declaration", "function_definition"),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set("function_call"),
  },
  {
    id: "zig",
    wasm: "tree-sitter-zig.wasm",
    extensions: [".zig"],
    functionTypes: set("function_declaration"),
    classTypes: set("container_declaration"),
    methodTypes: set("function_declaration"),
    typeTypes: set("variable_declaration"),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set("call_expression"),
  },
  {
    id: "elixir",
    wasm: "tree-sitter-elixir.wasm",
    extensions: [".ex", ".exs"],
    functionTypes: set("call"), // def/defp are calls in Elixir grammar
    classTypes: set("call"), // defmodule
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("unary_operator", "call"),
    callTypes: set("call"),
  },
  {
    id: "objc",
    wasm: "tree-sitter-objc.wasm",
    extensions: [".m", ".mm"],
    functionTypes: set("function_definition", "method_definition"),
    classTypes: set("class_interface", "class_implementation", "struct_specifier"),
    methodTypes: set("method_definition"),
    typeTypes: set("type_definition"),
    interfaceTypes: set("protocol_declaration"),
    importTypes: set("preproc_include", "import_declaration"),
    callTypes: set("call_expression", "message_expression"),
  },
  {
    id: "bash",
    wasm: "tree-sitter-bash.wasm",
    extensions: [".sh", ".bash", ".zsh"],
    functionTypes: set("function_definition"),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("command"), // source/. often commands
    callTypes: set("command"),
  },
  {
    id: "dart",
    wasm: "tree-sitter-dart.wasm",
    extensions: [".dart"],
    functionTypes: set("function_signature", "method_signature", "function_expression"),
    classTypes: set("class_definition", "enum_declaration", "mixin_declaration"),
    methodTypes: set("method_signature"),
    typeTypes: set("type_alias"),
    interfaceTypes: set(),
    importTypes: set("import_specification", "import_or_export"),
    callTypes: set("method_invocation", "function_expression_invocation"),
  },
  {
    id: "javascript",
    wasm: "tree-sitter-javascript.wasm",
    extensions: [".js", ".mjs", ".cjs"],
    functionTypes: set("function_declaration", "generator_function_declaration", "method_definition"),
    classTypes: set("class_declaration"),
    methodTypes: set("method_definition"),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("import_statement"),
    callTypes: set("call_expression", "new_expression"),
  },
  {
    id: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    extensions: [".ts", ".mts", ".cts"],
    functionTypes: set("function_declaration", "generator_function_declaration", "method_definition"),
    classTypes: set("class_declaration"),
    methodTypes: set("method_definition"),
    typeTypes: set("type_alias_declaration"),
    interfaceTypes: set("interface_declaration"),
    importTypes: set("import_statement"),
    callTypes: set("call_expression", "new_expression"),
  },
  {
    id: "tsx",
    wasm: "tree-sitter-tsx.wasm",
    extensions: [".tsx", ".jsx"],
    functionTypes: set("function_declaration", "generator_function_declaration", "method_definition"),
    classTypes: set("class_declaration"),
    methodTypes: set("method_definition"),
    typeTypes: set("type_alias_declaration"),
    interfaceTypes: set("interface_declaration"),
    importTypes: set("import_statement"),
    callTypes: set("call_expression", "new_expression"),
  },
  {
    id: "json",
    wasm: "tree-sitter-json.wasm",
    extensions: [".json"],
    functionTypes: set(),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set(),
  },
  {
    id: "yaml",
    wasm: "tree-sitter-yaml.wasm",
    extensions: [".yml", ".yaml"],
    functionTypes: set(),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set(),
  },
  {
    id: "toml",
    wasm: "tree-sitter-toml.wasm",
    extensions: [".toml"],
    functionTypes: set(),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set(),
  },
  {
    id: "html",
    wasm: "tree-sitter-html.wasm",
    extensions: [".html", ".htm"],
    functionTypes: set(),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set(),
    callTypes: set(),
  },
  {
    id: "css",
    wasm: "tree-sitter-css.wasm",
    extensions: [".css"],
    functionTypes: set(),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("import_statement"),
    callTypes: set(),
  },
  {
    id: "vue",
    wasm: "tree-sitter-vue.wasm",
    extensions: [".vue"],
    functionTypes: set("function_declaration", "method_definition"),
    classTypes: set(),
    methodTypes: set("method_definition"),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("import_statement"),
    callTypes: set("call_expression"),
  },
  {
    id: "solidity",
    wasm: "tree-sitter-solidity.wasm",
    extensions: [".sol"],
    functionTypes: set("function_definition", "modifier_definition", "constructor_definition"),
    classTypes: set("contract_declaration", "library_declaration", "interface_declaration"),
    methodTypes: set("function_definition"),
    typeTypes: set("struct_declaration", "enum_declaration", "event_definition", "error_declaration"),
    interfaceTypes: set("interface_declaration"),
    importTypes: set("import_directive"),
    callTypes: set("call_expression"),
  },
  {
    id: "ocaml",
    wasm: "tree-sitter-ocaml.wasm",
    extensions: [".ml", ".mli"],
    functionTypes: set("let_binding", "fun_binding", "method_definition"),
    classTypes: set("class_definition", "module_definition"),
    methodTypes: set("method_definition"),
    typeTypes: set("type_definition"),
    interfaceTypes: set("module_type_definition"),
    importTypes: set("open_module", "include_module"),
    callTypes: set("application_expression"),
  },
  {
    id: "elm",
    wasm: "tree-sitter-elm.wasm",
    extensions: [".elm"],
    functionTypes: set("value_declaration", "function_declaration_left"),
    classTypes: set("type_declaration", "type_alias_declaration"),
    methodTypes: set(),
    typeTypes: set("type_declaration", "type_alias_declaration"),
    interfaceTypes: set(),
    importTypes: set("import_clause"),
    callTypes: set("function_call_expr"),
  },
  {
    id: "rescript",
    wasm: "tree-sitter-rescript.wasm",
    extensions: [".res", ".resi"],
    functionTypes: set("let_declaration", "function"),
    classTypes: set("module_declaration", "type_declaration"),
    methodTypes: set(),
    typeTypes: set("type_declaration"),
    interfaceTypes: set(),
    importTypes: set("open_statement", "include_statement"),
    callTypes: set("call_expression"),
  },
  {
    id: "ql",
    wasm: "tree-sitter-ql.wasm",
    extensions: [".ql", ".qll"],
    functionTypes: set("predicate", "charpred"),
    classTypes: set("dataclass", "datatype"),
    methodTypes: set(),
    typeTypes: set("typeAlias"),
    interfaceTypes: set(),
    importTypes: set("importDirective", "module"),
    callTypes: set("call"),
  },
  {
    id: "elisp",
    wasm: "tree-sitter-elisp.wasm",
    extensions: [".el"],
    functionTypes: set("function_definition"),
    classTypes: set(),
    methodTypes: set(),
    typeTypes: set(),
    interfaceTypes: set(),
    importTypes: set("list"), // require/provide often lists
    callTypes: set("list"),
  },
];

const PROFILE_BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
const PROFILE_BY_EXT = new Map<string, LangProfile>();
for (const profile of PROFILES) {
  for (const ext of profile.extensions) {
    PROFILE_BY_EXT.set(ext, profile);
  }
}

export function supportedTreeSitterLanguages(): readonly TreeSitterLanguageId[] {
  return PROFILES.map((p) => p.id);
}

export function treeSitterExtensions(): readonly string[] {
  return [...PROFILE_BY_EXT.keys()];
}

export function resolveTreeSitterLanguage(filePath: string): TreeSitterLanguageId | null {
  const ext = path.extname(filePath).toLowerCase();
  return PROFILE_BY_EXT.get(ext)?.id ?? null;
}

let parserInit: Promise<void> | null = null;
const languageCache = new Map<TreeSitterLanguageId, Language>();

async function ensureParser(): Promise<void> {
  if (!parserInit) parserInit = Parser.init();
  await parserInit;
}

function vscodeWasmPath(profile: LangProfile): string | null {
  try {
    const pkgRoot = path.dirname(require.resolve("@vscode/tree-sitter-wasm/package.json"));
    // VS Code package uses kebab-case for C# (`c-sharp`); profiles use `c_sharp`.
    const file =
      profile.wasm === "tree-sitter-c_sharp.wasm"
        ? "tree-sitter-c-sharp.wasm"
        : profile.wasm;
    const candidate = path.join(pkgRoot, "wasm", file);
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function legacyWasmPath(profile: LangProfile): string {
  const pkgRoot = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  return path.join(pkgRoot, "out", profile.wasm);
}

function wasmPath(profile: LangProfile): string {
  // Prefer @vscode/tree-sitter-wasm (ABI-compatible with web-tree-sitter ≥0.26).
  // Fall back to tree-sitter-wasms for languages VS Code does not ship yet.
  return vscodeWasmPath(profile) ?? legacyWasmPath(profile);
}

async function getLanguage(id: TreeSitterLanguageId): Promise<Language> {
  await ensureParser();
  const cached = languageCache.get(id);
  if (cached) return cached;
  const profile = PROFILE_BY_ID.get(id);
  if (!profile) throw new Error(`Unknown tree-sitter language: ${id}`);
  const language = await Language.load(wasmPath(profile));
  languageCache.set(id, language);
  return language;
}

function childName(node: Node): string | undefined {
  const field = node.childForFieldName("name");
  if (field?.text) return field.text;
  for (const c of node.children) {
    if (!c) continue;
    if (
      c.type === "identifier" ||
      c.type === "type_identifier" ||
      c.type === "field_identifier" ||
      c.type === "property_identifier" ||
      c.type === "name" ||
      c.type === "constant" ||
      c.type === "simple_identifier" ||
      c.type === "type_identifier" ||
      c.type === "scoped_identifier"
    ) {
      return c.text;
    }
  }
  return undefined;
}

function calleeName(node: Node): string | undefined {
  const fn =
    node.childForFieldName("function") ??
    node.childForFieldName("method") ??
    node.childForFieldName("name") ??
    node.namedChild(0);
  if (!fn) return undefined;
  if (
    fn.type === "identifier" ||
    fn.type === "field_identifier" ||
    fn.type === "property_identifier" ||
    fn.type === "simple_identifier"
  ) {
    return fn.text;
  }
  return (
    fn.childForFieldName("name")?.text ??
    childName(fn) ??
    (fn.namedChild(fn.namedChildCount - 1)?.type.includes("identifier")
      ? fn.namedChild(fn.namedChildCount - 1)?.text
      : undefined)
  );
}

function registerSymbol(
  nodes: CodeGraphNode[],
  symbolIds: Map<string, string>,
  relFilePath: string,
  kind: CodeGraphNode["kind"],
  name: string,
  startLine: number,
  tags?: string[]
): void {
  const id = `${relFilePath}::${kind}::${name}#L${startLine}`;
  nodes.push({
    id,
    kind,
    name,
    filePath: relFilePath,
    startLine,
    tags,
  });
  if (!symbolIds.has(name)) symbolIds.set(name, id);
}

function extractWithProfile(
  profile: LangProfile,
  relFilePath: string,
  root: Node
): TreeSitterExtractResult {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const symbolIds = new Map<string, string>();
  const fileId = fileNodeId(relFilePath);
  nodes.push({
    id: fileId,
    kind: "file",
    name: relFilePath,
    filePath: relFilePath,
    tags: [`lang:${profile.id}`],
  });

  const seenModule = new Set<string>();

  const visit = (node: Node): void => {
    const line = node.startPosition.row + 1;
    const name = childName(node);

    if (name && profile.functionTypes.has(node.type) && !profile.methodTypes.has(node.type)) {
      registerSymbol(nodes, symbolIds, relFilePath, "function", name, line);
    } else if (name && profile.methodTypes.has(node.type)) {
      // Prefer method when type is in both sets (e.g. rust function_item in impl)
      const kind =
        profile.functionTypes.has(node.type) && node.parent?.type.includes("impl")
          ? "method"
          : profile.methodTypes.has(node.type) && !profile.functionTypes.has(node.type)
            ? "method"
            : profile.functionTypes.has(node.type)
              ? "function"
              : "method";
      registerSymbol(nodes, symbolIds, relFilePath, kind, name, line);
    } else if (name && profile.classTypes.has(node.type)) {
      registerSymbol(nodes, symbolIds, relFilePath, "class", name, line);
    } else if (name && profile.interfaceTypes.has(node.type)) {
      registerSymbol(nodes, symbolIds, relFilePath, "interface", name, line);
    } else if (name && profile.typeTypes.has(node.type)) {
      registerSymbol(nodes, symbolIds, relFilePath, "type", name, line);
    }

    if (profile.importTypes.has(node.type)) {
      // Ruby: only treat require/include/load as imports
      if (profile.id === "ruby" && node.type === "call") {
        const callee = calleeName(node)?.toLowerCase();
        if (callee !== "require" && callee !== "require_relative" && callee !== "load" && callee !== "include") {
          // fall through to call handling
        } else {
          const mod = node.text.replace(/\s+/g, " ").slice(0, 120);
          const targetId = `${mod}::module`;
          if (!seenModule.has(targetId)) {
            seenModule.add(targetId);
            edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
            nodes.push({ id: targetId, kind: "module", name: mod, tags: ["import-spec"] });
          }
        }
      } else if (profile.id === "elixir" && node.type === "call") {
        const callee = calleeName(node);
        if (callee === "defmodule" && name) {
          registerSymbol(nodes, symbolIds, relFilePath, "module", name, line, ["elixir-module"]);
        } else if ((callee === "def" || callee === "defp") && name) {
          registerSymbol(nodes, symbolIds, relFilePath, "function", name, line);
        } else if (callee === "import" || callee === "alias" || callee === "require" || callee === "use") {
          const mod = node.text.replace(/\s+/g, " ").slice(0, 120);
          const targetId = `${mod}::module`;
          if (!seenModule.has(targetId)) {
            seenModule.add(targetId);
            edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
            nodes.push({ id: targetId, kind: "module", name: mod, tags: ["import-spec"] });
          }
        }
      } else if (!(profile.id === "ruby" && node.type === "call") && !(profile.id === "elixir" && node.type === "call")) {
        const mod = node.text.replace(/\s+/g, " ").slice(0, 120);
        const targetId = `${mod}::module`;
        if (!seenModule.has(targetId)) {
          seenModule.add(targetId);
          edges.push({ from: fileId, to: targetId, kind: "imports", confidence: "EXTRACTED" });
          nodes.push({ id: targetId, kind: "module", name: mod, tags: ["import-spec"] });
        }
      }
    }

    if (profile.callTypes.has(node.type)) {
      // Skip elixir/ruby special forms already handled as definitions
      const skipElixirDef =
        profile.id === "elixir" &&
        node.type === "call" &&
        ["defmodule", "def", "defp", "import", "alias", "require", "use"].includes(
          calleeName(node) ?? ""
        );
      const skipRubyReq =
        profile.id === "ruby" &&
        node.type === "call" &&
        ["require", "require_relative", "load", "include"].includes(
          (calleeName(node) ?? "").toLowerCase()
        );
      if (!skipElixirDef && !skipRubyReq) {
        const cname = calleeName(node);
        if (cname) {
          const target = symbolIds.get(cname);
          edges.push({
            from: fileId,
            to: target ?? `unresolved::${cname}`,
            kind: "calls",
            confidence: target ? "INFERRED" : "AMBIGUOUS",
          });
        }
      }
    }

    for (const child of node.children) {
      if (child) visit(child);
    }
  };

  visit(root);

  for (const n of nodes) {
    if (n.id !== fileId && n.kind !== "module") {
      edges.push({ from: fileId, to: n.id, kind: "contains", confidence: "EXTRACTED" });
    }
  }
  const seenUnresolved = new Set<string>();
  for (const e of edges) {
    if (e.to.startsWith("unresolved::") && !seenUnresolved.has(e.to)) {
      seenUnresolved.add(e.to);
      nodes.push({
        id: e.to,
        kind: "function",
        name: e.to.replace(/^unresolved::/, ""),
        tags: ["unresolved"],
      });
    }
  }
  return { nodes, edges };
}

export async function extractWithTreeSitter(
  lang: TreeSitterLanguageId,
  relFilePath: string,
  content: string
): Promise<TreeSitterExtractResult> {
  const profile = PROFILE_BY_ID.get(lang);
  if (!profile) throw new Error(`Unknown tree-sitter language: ${lang}`);
  const language = await getLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(content);
  if (!tree) throw new Error(`tree-sitter failed to parse ${relFilePath}`);
  return extractWithProfile(profile, relFilePath, tree.rootNode);
}

export function treeSitterAvailable(): boolean {
  try {
    require.resolve("tree-sitter-wasms/package.json");
    return true;
  } catch {
    return false;
  }
}
