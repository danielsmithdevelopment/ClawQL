/**
 * Scaffold ontology dirs, entities, and vertical packs.
 */
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

export function ontologyRoot(rootDir: string): string {
  return join(resolve(rootDir), ".clawql", "ontology");
}

export function packRoot(packId: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "packs", packId);
}

async function initOntologyTreeImpl(rootDir: string): Promise<string[]> {
  const root = ontologyRoot(rootDir);
  const dirs = [join(root, "entities"), join(root, "relationships"), join(root, "actions")];
  for (const d of dirs) await mkdir(d, { recursive: true });
  const readme = join(root, "README.md");
  await writeFile(
    readme,
    [
      "# ClawQL Ontology (Git schema)",
      "",
      "Entity definitions live under `entities/` (`.cqe` or `.yaml`).",
      "Instances and memory stay in object storage / the Obsidian vault — not here.",
      "",
      "```bash",
      "clawql ontology lint --dir .clawql/ontology/entities",
      "clawql ontology generate --dir .clawql/ontology/entities --out generated/ontology",
      "```",
      "",
    ].join("\n"),
    "utf8"
  );
  return [...dirs, readme];
}

export function initOntologyTreeEffect(rootDir: string): Effect.Effect<string[], Error> {
  return Effect.tryPromise({
    try: () => initOntologyTreeImpl(rootDir),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link initOntologyTreeEffect} for Effect callers. */
export async function initOntologyTree(rootDir: string): Promise<string[]> {
  return Effect.runPromise(initOntologyTreeEffect(rootDir));
}

export function entityTemplate(name: string): string {
  const idProp = `${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}_id`;
  return `apiVersion: clawql.dev/ontology/v1alpha1
kind: Entity
metadata:
  name: ${name}
spec:
  description: TODO — describe ${name}
  properties:
    ${idProp}:
      type: string
      required: true
      indexed: true
    status:
      type: enum
      values: [draft, active]
      required: true
  sources:
    - type: sql
      connection: \${VAULT:example_db}
      table: ${idProp.replace(/_id$/, "")}s
      id_column: ${idProp}
  actions:
    - name: search_${idProp.replace(/_id$/, "")}s
      kind: read
    - name: get_${idProp.replace(/_id$/, "")}
      kind: read
`;
}

async function createOntologyEntityImpl(rootDir: string, name: string): Promise<string> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error(`Entity name must be PascalCase (got ${JSON.stringify(name)})`);
  }
  await initOntologyTree(rootDir);
  const dest = join(ontologyRoot(rootDir), "entities", `${name}.cqe`);
  if (existsSync(dest)) {
    throw new Error(`Entity already exists: ${dest}`);
  }
  await writeFile(dest, entityTemplate(name), "utf8");
  return dest;
}

export function createOntologyEntityEffect(
  rootDir: string,
  name: string
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => createOntologyEntityImpl(rootDir, name),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link createOntologyEntityEffect} for Effect callers. */
export async function createOntologyEntity(rootDir: string, name: string): Promise<string> {
  return Effect.runPromise(createOntologyEntityEffect(rootDir, name));
}

async function importOntologyPackImpl(rootDir: string, packId: string): Promise<string[]> {
  const src = packRoot(packId);
  if (!existsSync(src)) {
    throw new Error(
      `Unknown pack ${JSON.stringify(packId)}. Available: ${listOntologyPacks().join(", ") || "(none)"}`
    );
  }
  await initOntologyTree(rootDir);
  const entitiesSrc = join(src, "entities");
  const entitiesDest = join(ontologyRoot(rootDir), "entities");
  await cp(entitiesSrc, entitiesDest, { recursive: true });
  const written: string[] = [];
  for (const name of await readdir(entitiesDest)) {
    if (/\.(cqe|ya?ml|json)$/i.test(name)) written.push(join(entitiesDest, name));
  }
  return written;
}

export function importOntologyPackEffect(
  rootDir: string,
  packId: string
): Effect.Effect<string[], Error> {
  return Effect.tryPromise({
    try: () => importOntologyPackImpl(rootDir, packId),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link importOntologyPackEffect} for Effect callers. */
export async function importOntologyPack(rootDir: string, packId: string): Promise<string[]> {
  return Effect.runPromise(importOntologyPackEffect(rootDir, packId));
}

export function listOntologyPacks(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const packsDir = join(here, "..", "packs");
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      const entities = join(packsDir, name, "entities");
      if (!existsSync(entities)) return false;
      try {
        return readdirSync(entities).some((f) => /\.(cqe|ya?ml|json)$/i.test(f));
      } catch {
        return false;
      }
    })
    .sort();
}
