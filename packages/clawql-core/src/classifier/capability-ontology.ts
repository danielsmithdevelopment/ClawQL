/**
 * ClawQL capability ontology — catalog-generated (preferred) or hand fixture fallback.
 * @see docs/specs/classifier/capability-ontology-from-catalog-v0.1.md
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import type { DistinguishFromEntry } from "../plugin/routing-hint.js";
import {
  digestCanonicalJson,
  generateCapabilityOntology,
  type GeneratedCapabilityOntology,
} from "./generate-capability-ontology.js";

export type CapabilityKind = "tool" | "skill" | "anti_pattern";

export type CapabilityEntry = {
  readonly capabilityId: string;
  readonly kind: CapabilityKind;
  readonly label: string;
  readonly mcpTool?: string;
  readonly whenToUse: string;
  readonly whenNotToUse: string;
  /**
   * Routing / policy metadata only — never packed into GLiNER classify text or labels.
   */
  readonly requiresStructuredCorpus: boolean;
  readonly ontologyRole: string;
  readonly aliases: readonly string[];
  readonly distinguishFrom?: readonly DistinguishFromEntry[];
};

export type CapabilityOntology = {
  readonly ontologyId: string;
  readonly preferredVocabulary: string;
  readonly description: string;
  readonly capabilities: readonly CapabilityEntry[];
  /** Present on generated ontologies; record in eval summaries. */
  readonly digestSha256?: string;
};

const HAND_FILENAME = "clawql-capability-ontology.json";
const GENERATED_FILENAME = "capability-ontology.generated.json";
const DIGEST_FILENAME = "capability-ontology.digest";

function fixtureDirs(): string[] {
  const out: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    out.push(
      join(here, "fixtures"),
      join(here, "classifier-fixtures"),
      join(here, "..", "classifier-fixtures"),
      join(here, "..", "fixtures")
    );
  } catch {
    /* CJS */
  }
  out.push(
    join(process.cwd(), "packages/clawql-core/src/classifier/fixtures"),
    join(process.cwd(), "src/classifier/fixtures"),
    join(process.cwd(), "packages/clawql-core/dist/classifier-fixtures"),
    join(process.cwd(), "dist/classifier-fixtures")
  );
  return out;
}

function tryRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Prefer generated ontology; fall back to generating in-process from catalog; then hand fixture. */
export function clawqlCapabilityOntologyPath(): string {
  for (const dir of fixtureDirs()) {
    const gen = join(dir, GENERATED_FILENAME);
    if (tryRead(gen) != null) return gen;
  }
  for (const dir of fixtureDirs()) {
    const hand = join(dir, HAND_FILENAME);
    if (tryRead(hand) != null) return hand;
  }
  throw new Error(
    `ClawQL capability ontology JSON not found (looked for ${GENERATED_FILENAME} / ${HAND_FILENAME}; cwd=${process.cwd()})`
  );
}

export function loadClawqlCapabilityOntology(): CapabilityOntology {
  // Prefer live generation from frozen catalog so digests stay honest without a prior build step.
  try {
    return generateCapabilityOntology();
  } catch {
    /* fall through to on-disk */
  }
  const path = clawqlCapabilityOntologyPath();
  const raw = JSON.parse(tryRead(path) ?? "{}") as CapabilityOntology;
  if (!raw.ontologyId || !Array.isArray(raw.capabilities)) {
    throw new Error("invalid clawql capability ontology");
  }
  return raw;
}

export function loadClawqlCapabilityOntologyEffect(): Effect.Effect<CapabilityOntology, Error> {
  return Effect.try({
    try: () => loadClawqlCapabilityOntology(),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

/** Digest of the loaded ontology (generated digest field, or hash of capabilities). */
export function capabilityOntologyDigest(ontology: CapabilityOntology): string {
  if (ontology.digestSha256) return ontology.digestSha256;
  return digestCanonicalJson(ontology);
}

export function indexCapabilityOntology(
  ontology: CapabilityOntology
): ReadonlyMap<string, CapabilityEntry> {
  const map = new Map<string, CapabilityEntry>();
  for (const c of ontology.capabilities) {
    // Primary key: exact capabilityId (per-id rows — siblings must not share one paragraph).
    map.set(c.capabilityId, c);
    map.set(c.capabilityId.toLowerCase(), c);
  }
  // Aliases only fill gaps — never overwrite an existing capabilityId row.
  for (const c of ontology.capabilities) {
    if (c.mcpTool && !map.has(c.mcpTool)) map.set(c.mcpTool, c);
    const labelKey = c.label.toLowerCase();
    if (!map.has(labelKey)) map.set(labelKey, c);
    for (const a of c.aliases) {
      if (!map.has(a)) map.set(a, c);
      if (!map.has(a.toLowerCase())) map.set(a.toLowerCase(), c);
    }
  }
  return map;
}

/**
 * Resolve a candidate id to a catalog row.
 * Exact capabilityId wins; bare-name fallback only when no exact row exists.
 */
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

export type { GeneratedCapabilityOntology };
export { generateCapabilityOntology, DIGEST_FILENAME, GENERATED_FILENAME };
