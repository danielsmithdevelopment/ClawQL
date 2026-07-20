/**
 * Generate read-only MCP tool definitions from ontology Entity actions.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  defaultOntologySearchRoots,
  loadOntologyEntities,
} from "./load.js";
import type {
  GeneratedReadTool,
  OntologyGenerateResult,
  OntologyLintResult,
} from "./types.js";
import { lintOntology } from "./lint.js";

function snakeEntity(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function defaultReadToolsForEntity(entityName: string): Omit<GeneratedReadTool, "sourcePath" | "entity">[] {
  const snake = snakeEntity(entityName);
  return [
    {
      name: `search_${snake}s`,
      kind: "read",
      description: `Search ${entityName} entities by free-text query`,
      inputSchema: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results", optional: true },
      },
    },
    {
      name: `get_${snake}`,
      kind: "read",
      description: `Fetch a single ${entityName} by id`,
      inputSchema: {
        id: { type: "string", description: `${entityName} identifier` },
      },
    },
  ];
}

export type GenerateOntologyOptions = {
  rootDir?: string;
  paths?: string[];
  schemaPath?: string;
  /** Output directory for tools.json + plugin stub. */
  outDir: string;
  /** Skip lint gate (not recommended). */
  skipLint?: boolean;
  /** When true, synthesize search_/get_ tools if entity has no read actions. */
  synthesizeDefaults?: boolean;
};

export async function generateOntologyReadTools(
  opts: GenerateOntologyOptions
): Promise<{
  result: OntologyGenerateResult;
  lint?: OntologyLintResult;
  written: string[];
}> {
  const rootDir = resolve(opts.rootDir ?? process.cwd());
  const search =
    opts.paths && opts.paths.length > 0
      ? opts.paths.map((p) => resolve(rootDir, p))
      : defaultOntologySearchRoots(rootDir);

  let lint: OntologyLintResult | undefined;
  if (!opts.skipLint) {
    lint = await lintOntology({
      rootDir,
      paths: search,
      schemaPath: opts.schemaPath,
    });
    if (!lint.ok) {
      return {
        result: { tools: [], deferredWriteActions: [], entities: lint.entities },
        lint,
        written: [],
      };
    }
  }

  const { loaded, loadErrors } = await loadOntologyEntities(search);
  if (loadErrors.length) {
    throw new Error(loadErrors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  }

  const tools: GeneratedReadTool[] = [];
  const deferredWriteActions: OntologyGenerateResult["deferredWriteActions"] = [];
  const entities: string[] = [];
  const synthesize = opts.synthesizeDefaults !== false;

  for (const { path, entity } of loaded) {
    const name = entity.metadata?.name;
    if (!name) continue;
    entities.push(name);
    const actions = entity.spec?.actions ?? [];
    const readActions = actions.filter((a) => a.kind === "read");
    for (const a of actions.filter((x) => x.kind === "write")) {
      deferredWriteActions.push({ entity: name, name: a.name, sourcePath: path });
    }

    if (readActions.length === 0 && synthesize) {
      for (const t of defaultReadToolsForEntity(name)) {
        tools.push({ ...t, entity: name, sourcePath: path });
      }
    } else {
      for (const a of readActions) {
        tools.push({
          name: a.name,
          entity: name,
          kind: "read",
          description: a.description?.trim() || `Read action ${a.name} on ${name}`,
          inputSchema: {
            query: {
              type: "string",
              description: "Optional query / filter",
              optional: true,
            },
            id: {
              type: "string",
              description: `${name} identifier when fetching one record`,
              optional: true,
            },
          },
          sourcePath: path,
        });
      }
    }
  }

  const result: OntologyGenerateResult = { tools, deferredWriteActions, entities };
  const outDir = resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });

  const toolsJsonPath = join(outDir, "tools.json");
  const catalog = {
    apiVersion: "clawql.dev/ontology/v1alpha1",
    kind: "GeneratedReadTools",
    generatedAt: new Date().toISOString(),
    entities,
    tools,
    deferredWriteActions,
  };
  await writeFile(toolsJsonPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const pluginPath = join(outDir, "ontology-plugin.stub.ts");
  await writeFile(pluginPath, renderPluginStub(tools), "utf8");

  const readmePath = join(outDir, "README.md");
  await writeFile(
    readmePath,
    [
      "# Generated ontology read tools",
      "",
      "Produced by `clawql ontology generate` (ADR 0009).",
      "",
      `- **tools.json** — MCP tool catalog (read-only)`,
      `- **ontology-plugin.stub.ts** — TypeScript stub for a future \`createOntologyPlugin()\``,
      "",
      "Write / kinetic actions are listed under `deferredWriteActions` and are **not** registered in v1.",
      "",
    ].join("\n"),
    "utf8"
  );

  return {
    result,
    lint,
    written: [toolsJsonPath, pluginPath, readmePath],
  };
}

function renderPluginStub(tools: GeneratedReadTool[]): string {
  const toolList = tools
    .map(
      (t) =>
        `  { name: ${JSON.stringify(t.name)}, entity: ${JSON.stringify(t.entity)}, description: ${JSON.stringify(t.description)} }`
    )
    .join(",\n");

  return `/**
 * AUTO-GENERATED by \`clawql ontology generate\` — do not hand-edit.
 * Read-only MCP tool stubs for the enterprise Ontology (ADR 0009).
 *
 * Wire into ClawQL by implementing handlers that query entity sources
 * (SQL / OpenAPI / Onyx) and registering via ClawQLPluginRegistrationApi.
 */

export const ONTOLOGY_READ_TOOLS = [
${toolList}
] as const;

// Register each tool with api.registerMcpTool({ name, schema, handler })
// Write/kinetic actions are intentionally omitted in v1.
`;
}
