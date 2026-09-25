/**
 * ClawQL capability ontology — Layer-1 style catalog for Fast Decision enrichment.
 * Maps MCP tools / skills / anti-patterns so the scorer sees whenToUse context,
 * not bare candidate ids (§6.4 / ontology+classifier hypothesis).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

export type CapabilityKind = "tool" | "skill" | "anti_pattern";

export type CapabilityEntry = {
  readonly capabilityId: string;
  readonly kind: CapabilityKind;
  readonly label: string;
  readonly mcpTool?: string;
  readonly whenToUse: string;
  readonly whenNotToUse: string;
  readonly requiresStructuredCorpus: boolean;
  readonly ontologyRole: string;
  readonly aliases: readonly string[];
};

export type CapabilityOntology = {
  readonly ontologyId: string;
  readonly preferredVocabulary: string;
  readonly description: string;
  readonly capabilities: readonly CapabilityEntry[];
};

const FILENAME = "clawql-capability-ontology.json";

function candidatePaths(): string[] {
  const out: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    out.push(
      join(here, "fixtures", FILENAME),
      join(here, "..", "fixtures", FILENAME),
      join(here, "classifier-fixtures", FILENAME),
      join(here, "..", "classifier-fixtures", FILENAME)
    );
  } catch {
    /* CJS: import.meta may throw */
  }
  out.push(
    join(process.cwd(), "src/classifier/fixtures", FILENAME),
    join(process.cwd(), "packages/clawql-core/src/classifier/fixtures", FILENAME),
    join(process.cwd(), "packages/clawql-core/dist/classifier-fixtures", FILENAME),
    join(process.cwd(), "dist/classifier-fixtures", FILENAME)
  );
  return out;
}

export function clawqlCapabilityOntologyPath(): string {
  for (const p of candidatePaths()) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `ClawQL capability ontology JSON not found (looked for ${FILENAME}; cwd=${process.cwd()})`
  );
}

export function loadClawqlCapabilityOntology(): CapabilityOntology {
  const raw = JSON.parse(readFileSync(clawqlCapabilityOntologyPath(), "utf8")) as CapabilityOntology;
  if (!raw.ontologyId || !Array.isArray(raw.capabilities)) {
    throw new Error("invalid clawql capability ontology");
  }
  return raw;
}

/** Effect.sync host for Effect-first call sites. */
export function loadClawqlCapabilityOntologyEffect(): Effect.Effect<CapabilityOntology, Error> {
  return Effect.try({
    try: () => loadClawqlCapabilityOntology(),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export function indexCapabilityOntology(
  ontology: CapabilityOntology
): ReadonlyMap<string, CapabilityEntry> {
  const map = new Map<string, CapabilityEntry>();
  for (const c of ontology.capabilities) {
    map.set(c.capabilityId, c);
    map.set(c.label.toLowerCase(), c);
    if (c.mcpTool) map.set(c.mcpTool, c);
    for (const a of c.aliases) {
      map.set(a, c);
      map.set(a.toLowerCase(), c);
    }
  }
  return map;
}

export function lookupCapability(
  index: ReadonlyMap<string, CapabilityEntry>,
  candidateId: string
): CapabilityEntry | undefined {
  return (
    index.get(candidateId) ??
    index.get(candidateId.toLowerCase()) ??
    index.get(candidateId.replace(/^mcp\./, "").replace(/^tool\./, ""))
  );
}
