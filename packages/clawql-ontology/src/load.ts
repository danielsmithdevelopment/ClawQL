/**
 * Load ontology Entity YAML/JSON files from disk.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { LoadedOntologyEntity, OntologyEntityDocument } from "./types.js";

const ENTITY_EXT = /\.(ya?ml|json)$/i;

async function walkMarkdownOrYaml(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      await walkMarkdownOrYaml(full, out);
    } else if (ent.isFile() && ENTITY_EXT.test(ent.name)) {
      out.push(full);
    }
  }
}

/** Discover entity files under a directory (recursive). */
export async function discoverOntologyEntityFiles(dir: string): Promise<string[]> {
  const abs = resolve(dir);
  const st = await stat(abs).catch(() => null);
  if (!st) return [];
  if (st.isFile()) return ENTITY_EXT.test(abs) ? [abs] : [];
  const out: string[] = [];
  await walkMarkdownOrYaml(abs, out);
  return out.sort();
}

export async function loadOntologyEntityFile(path: string): Promise<LoadedOntologyEntity> {
  const abs = resolve(path);
  const raw = await readFile(abs, "utf8");
  let doc: unknown;
  if (abs.toLowerCase().endsWith(".json")) {
    doc = JSON.parse(raw);
  } else {
    doc = parseYaml(raw);
  }
  return { path: abs, entity: doc as OntologyEntityDocument };
}

export async function loadOntologyEntities(
  pathsOrDirs: string[]
): Promise<{ loaded: LoadedOntologyEntity[]; loadErrors: { path: string; message: string }[] }> {
  const files = new Set<string>();
  for (const p of pathsOrDirs) {
    const abs = resolve(p);
    const st = await stat(abs).catch(() => null);
    if (!st) {
      continue;
    }
    if (st.isDirectory()) {
      for (const f of await discoverOntologyEntityFiles(abs)) files.add(f);
    } else if (ENTITY_EXT.test(abs)) {
      files.add(abs);
    }
  }

  const loaded: LoadedOntologyEntity[] = [];
  const loadErrors: { path: string; message: string }[] = [];
  for (const f of [...files].sort()) {
    try {
      loaded.push(await loadOntologyEntityFile(f));
    } catch (e) {
      loadErrors.push({
        path: f,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { loaded, loadErrors };
}

/** Default search roots relative to a workspace root. */
export function defaultOntologySearchRoots(rootDir: string): string[] {
  return [
    join(rootDir, ".clawql", "ontology", "entities"),
    join(rootDir, "examples", "ontology", "entities"),
  ];
}
