/**
 * Meta-ontology env flags (Layer 2 + Layer 3).
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §10
 */
import { Effect } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ScaffoldTtl } from "../shared/cqe-runtime-types.js";
import { ontologySync } from "./ontology-errors.js";

export type OntologyMetaConfig = {
  scaffoldEnabled: boolean;
  scaffoldTtl: ScaffoldTtl;
  metaEnabled: boolean;
  metaDbPath: string;
  minEvidence: number;
  promotionEvidence: number;
  promotionQuality: number;
  learnFailures: boolean;
  maxPatterns: number;
};

function parseTtl(raw: string | undefined): ScaffoldTtl {
  const v = (raw ?? "session").trim().toLowerCase();
  if (v === "session" || v === "permanent") return v;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return "session";
}

function parseBool(raw: string | undefined, defaultOn: boolean): boolean {
  if (raw === undefined || raw === "") return defaultOn;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseUnitInterval(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function defaultMetaDbPath(): string {
  return join(homedir(), ".ClawQL", "meta-ontology.db");
}

/** Read meta-ontology config from env (Effect.sync primary API). */
export function readOntologyMetaConfig(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<OntologyMetaConfig> {
  return ontologySync(() => ({
    scaffoldEnabled: parseBool(env.CLAWQL_ONTOLOGY_SCAFFOLD_ENABLED, true),
    scaffoldTtl: parseTtl(env.CLAWQL_ONTOLOGY_SCAFFOLD_TTL),
    metaEnabled: parseBool(env.CLAWQL_ONTOLOGY_META_ENABLED, true),
    metaDbPath: env.CLAWQL_ONTOLOGY_META_DB_PATH?.trim() || defaultMetaDbPath(),
    minEvidence: parsePositiveInt(env.CLAWQL_ONTOLOGY_META_MIN_EVIDENCE, 10),
    promotionEvidence: parsePositiveInt(env.CLAWQL_ONTOLOGY_META_PROMOTION_EVIDENCE, 50),
    promotionQuality: parseUnitInterval(env.CLAWQL_ONTOLOGY_META_PROMOTION_QUALITY, 0.85),
    learnFailures: parseBool(env.CLAWQL_ONTOLOGY_META_LEARN_FAILURES, true),
    maxPatterns: parsePositiveInt(env.CLAWQL_ONTOLOGY_META_MAX_PATTERNS, 1000),
  }));
}

/** Sync convenience for CLI / forced host boundaries. */
export function readOntologyMetaConfigSync(
  env: NodeJS.ProcessEnv = process.env
): OntologyMetaConfig {
  return Effect.runSync(readOntologyMetaConfig(env));
}
