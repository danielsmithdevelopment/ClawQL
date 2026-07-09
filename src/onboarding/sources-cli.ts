/**
 * `clawql sources` — add/list/remove user integrations from URL or CLI/MCP config.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cacheCustomSourceBody,
  detectSourceFromUrl,
  ensureSourceCacheDir,
  readCustomSourcesFile,
  removeCustomSource,
  resetSpecCache,
  slugifySourceId,
  upsertCustomSource,
  type CustomSourceEntry,
  type CustomSourceKind,
} from "clawql-api";
import { getClawqlHome } from "./paths.js";

export type SourcesAddOptions = {
  url?: string;
  name?: string;
  kind?: CustomSourceKind;
  id?: string;
  command?: string;
  args?: string[];
  graphqlEndpoint?: string;
  grpcEndpoint?: string;
  protoPath?: string;
  mcpUrl?: string;
  home?: string;
};

function parseKind(raw: string | undefined): CustomSourceKind | undefined {
  if (!raw?.trim()) return undefined;
  const k = raw.trim().toLowerCase();
  const allowed: CustomSourceKind[] = ["openapi", "discovery", "graphql", "grpc", "mcp", "cli"];
  if (allowed.includes(k as CustomSourceKind)) return k as CustomSourceKind;
  throw new Error(`Unknown kind: ${raw}. Use ${allowed.join("|")}`);
}

export async function runSourcesList(home?: string): Promise<number> {
  const h = home ?? getClawqlHome();
  const file = await readCustomSourcesFile(h);
  if (!file.sources.length) {
    console.log("No custom sources. Add one: clawql sources add <url>");
    return 0;
  }
  for (const s of file.sources) {
    const loc = s.url ?? s.mcpUrl ?? s.cliCommand ?? s.graphqlEndpoint ?? s.cachePath ?? "";
    console.log(`${s.id}\t${s.kind}\t${s.name}\t${loc}`);
  }
  return 0;
}

export async function runSourcesRemove(id: string, home?: string): Promise<number> {
  const h = home ?? getClawqlHome();
  const ok = await removeCustomSource(id, h);
  if (!ok) {
    console.error(`Source not found: ${id}`);
    return 1;
  }
  resetSpecCache();
  console.log(`Removed source: ${id}`);
  return 0;
}

export async function runSourcesAdd(options: SourcesAddOptions): Promise<number> {
  const home = options.home ?? getClawqlHome();
  const kind = parseKind(options.kind);

  if (kind === "cli" || options.command) {
    if (!options.command?.trim()) {
      console.error("CLI sources require --command");
      return 1;
    }
    const id = options.id?.trim() || slugifySourceId(options.name ?? options.command);
    const entry: CustomSourceEntry = {
      id,
      name: options.name?.trim() || options.command,
      kind: "cli",
      addedAt: new Date().toISOString(),
      cliCommand: options.command.trim(),
      cliArgs: options.args ?? [],
      cliDescription: `CLI: ${options.command}`,
    };
    const { path } = await upsertCustomSource(entry, home);
    resetSpecCache();
    console.log(`Added CLI source "${id}" → ${path}`);
    return 0;
  }

  const url = options.url?.trim();
  if (!url) {
    console.error("Usage: clawql sources add <url> [--name NAME] [--kind KIND]");
    console.error("       clawql sources add --kind cli --command <bin> [--args a,b]");
    return 1;
  }

  const detected = await detectSourceFromUrl(url, { kindHint: kind });
  const id = options.id?.trim() || slugifySourceId(options.name ?? detected.name ?? url);
  await ensureSourceCacheDir(id, home);

  let entry: CustomSourceEntry = {
    id,
    name: options.name?.trim() || detected.name || id,
    kind: detected.kind,
    addedAt: new Date().toISOString(),
    url,
  };

  if (detected.kind === "mcp") {
    entry = { ...entry, mcpUrl: url };
  } else if (detected.kind === "graphql") {
    entry = {
      ...entry,
      graphqlEndpoint: options.graphqlEndpoint?.trim() || detected.graphqlEndpoint || url,
    };
    if (detected.bodyText) {
      entry = await cacheCustomSourceBody(entry, detected.bodyText, home);
    }
  } else if (detected.kind === "grpc") {
    const protoAbs = join(home, "sources", id, "service.proto");
    if (detected.bodyText) {
      await writeFile(protoAbs, detected.bodyText, "utf8");
    }
    entry = {
      ...entry,
      grpcEndpoint: options.grpcEndpoint?.trim() || "localhost:50051",
      protoPath: options.protoPath?.trim() || `sources/${id}/service.proto`,
      grpcInsecure: true,
    };
  } else if (detected.bodyText) {
    entry = await cacheCustomSourceBody(entry, detected.bodyText, home);
  }

  const { path } = await upsertCustomSource(entry, home);
  resetSpecCache();
  console.log(`Added ${entry.kind} source "${id}" (${entry.name}) → ${path}`);
  console.log("Restart clawql-mcp (or your MCP client) to index the new source.");
  return 0;
}
