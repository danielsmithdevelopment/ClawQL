/**
 * Build-time capability ontology generation from the frozen routing catalog
 * + optional routing-hint overlays. Tool IDs must stay stable with the v0.3 suite.
 *
 * @see docs/specs/classifier/capability-ontology-from-catalog-v0.1.md
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DistinguishFromEntry } from "../plugin/routing-hint.js";
import type { CapabilityEntry, CapabilityKind, CapabilityOntology } from "./capability-ontology.js";

export type CapabilityProvenance =
  | { readonly source: "catalog-declared"; readonly catalogId: string }
  | { readonly source: "core-anti-pattern"; readonly id: string }
  | {
      readonly source: "hand-override";
      readonly reason: string;
      readonly overrideLogRef: string;
    };

export type GeneratedCapabilityEntry = CapabilityEntry & {
  readonly distinguishFrom: readonly DistinguishFromEntry[];
  readonly provenance: CapabilityProvenance;
};

export type GeneratedCapabilityOntology = CapabilityOntology & {
  readonly digestSha256: string;
  readonly capabilities: readonly GeneratedCapabilityEntry[];
};

export type CatalogSourceEntry = {
  readonly id: string;
  readonly kind: "tool" | "skill" | "anti_pattern";
  readonly label: string;
  readonly description: string;
};

export type CatalogSourceFile = {
  readonly catalogId: string;
  readonly note?: string;
  readonly entries: readonly CatalogSourceEntry[];
};

/** Optional per-id hint overlay (IDs must already exist in the catalog — never rename). */
export type RoutingHintOverlay = {
  readonly whenToUse?: string;
  readonly whenNotToUse?: string;
  readonly distinguishFrom?: readonly DistinguishFromEntry[];
  readonly requiresStructuredCorpus?: boolean;
  readonly ontologyRole?: string;
  /** Hand-override only — must not cite eval case ids or query text. */
  readonly handOverride?: { readonly reason: string; readonly overrideLogRef: string };
};

export type HintOverlayFile = {
  readonly overlays: Readonly<Record<string, RoutingHintOverlay>>;
};

const STRUCTURED_IDS = new Set([
  "mcp.data_query",
  "mcp.data_query_cohort_count",
  "mcp.memory_recall",
  "mcp.memory_recall_title_flag_a",
  "mcp.memory_recall_title_flag_b",
  "mcp.memory_recall_overbroad",
]);

function defaultRole(kind: CapabilityKind, id: string): string {
  if (kind === "anti_pattern") return "anti_pattern";
  if (kind === "skill") return "skill_workflow";
  if (id.includes("data_query") || id.includes("cohort")) return "structured_query";
  if (id.includes("memory_recall")) return "ontology_recall";
  if (id.includes("search") && !id.includes("onyx")) return "discovery";
  if (id.includes("execute")) return "mutation_or_read";
  return "tool";
}

function catalogFixturePaths(filename: string): string[] {
  const out: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    out.push(
      join(here, "held-out", "fixtures", filename),
      join(here, "fixtures", filename),
      join(here, "..", "held-out-fixtures", filename)
    );
  } catch {
    /* CJS */
  }
  out.push(
    join(process.cwd(), "packages/clawql-core/src/classifier/held-out/fixtures", filename),
    join(process.cwd(), "src/classifier/held-out/fixtures", filename),
    join(process.cwd(), "packages/clawql-core/dist/held-out-fixtures", filename)
  );
  return out;
}

export function resolveCatalogSourcePath(
  filename = "routing-fresh-v0.3-source-catalog.json"
): string {
  for (const p of catalogFixturePaths(filename)) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* next */
    }
  }
  throw new Error(`catalog source not found (${filename}); cwd=${process.cwd()}`);
}

export function loadCatalogSource(path?: string): CatalogSourceFile {
  const p = path ?? resolveCatalogSourcePath();
  const raw = JSON.parse(readFileSync(p, "utf8")) as CatalogSourceFile;
  if (!raw.catalogId || !Array.isArray(raw.entries)) {
    throw new Error(`invalid catalog source at ${p}`);
  }
  return raw;
}

export function loadHintOverlay(path?: string): HintOverlayFile {
  if (!path) return { overlays: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as HintOverlayFile;
  return { overlays: raw.overlays ?? {} };
}

/** Canonical JSON → SHA-256 (sorted keys, compact). */
export function digestCanonicalJson(value: unknown): string {
  const canon = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(canon);
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(rec).sort()) out[k] = canon(rec[k]);
      return out;
    }
    if (typeof o === "string") return o.split(/\s+/).join(" ");
    return o;
  };
  return createHash("sha256")
    .update(JSON.stringify(canon(value)), "utf8")
    .digest("hex");
}

/**
 * Generate one ontology row per catalog id (no sibling alias collapse).
 * Overlay may add hints; it must not introduce new IDs or rename existing ones.
 */
export function generateCapabilityOntology(args?: {
  readonly catalog?: CatalogSourceFile;
  readonly overlay?: HintOverlayFile;
  readonly ontologyId?: string;
}): GeneratedCapabilityOntology {
  const catalog = args?.catalog ?? loadCatalogSource();
  const overlay = args?.overlay ?? { overlays: {} };
  const overlayIds = Object.keys(overlay.overlays);
  const catalogIds = new Set(catalog.entries.map((e) => e.id));
  for (const id of overlayIds) {
    if (!catalogIds.has(id)) {
      throw new Error(
        `hint overlay references unknown id "${id}" — tool IDs must not change; add to catalog + re-freeze suite if needed`
      );
    }
  }

  const capabilities: GeneratedCapabilityEntry[] = catalog.entries.map((e) => {
    const hint = overlay.overlays[e.id] ?? {};
    const kind = e.kind as CapabilityKind;
    const provenance: CapabilityProvenance = hint.handOverride
      ? {
          source: "hand-override",
          reason: hint.handOverride.reason,
          overrideLogRef: hint.handOverride.overrideLogRef,
        }
      : kind === "anti_pattern"
        ? { source: "core-anti-pattern", id: e.id }
        : { source: "catalog-declared", catalogId: catalog.catalogId };

    return {
      capabilityId: e.id,
      kind,
      label: e.label,
      mcpTool: kind === "tool" ? e.id.replace(/^mcp\./, "") : undefined,
      whenToUse: hint.whenToUse?.trim() || e.description,
      whenNotToUse:
        hint.whenNotToUse?.trim() ||
        (kind === "anti_pattern"
          ? "Prefer structured catalog tools when a schema or corpus path exists"
          : "Not the primary tool when a more specific sibling matches the task"),
      requiresStructuredCorpus: hint.requiresStructuredCorpus ?? STRUCTURED_IDS.has(e.id),
      ontologyRole: hint.ontologyRole ?? defaultRole(kind, e.id),
      aliases: [], // per-id rows — no alias collapse
      distinguishFrom: hint.distinguishFrom ?? [],
      provenance,
    };
  });

  const base: CapabilityOntology = {
    ontologyId: args?.ontologyId ?? "clawql-capability-ontology-generated-v0.1",
    preferredVocabulary: "project-local",
    description:
      "Generated from live routing catalog (one row per tool/skill id). requiresStructuredCorpus is metadata only — never packed into GLiNER labels.",
    capabilities,
  };

  const digestSha256 = digestCanonicalJson({
    ontologyId: base.ontologyId,
    preferredVocabulary: base.preferredVocabulary,
    description: base.description,
    capabilities: base.capabilities,
  });

  return { ...base, digestSha256, capabilities };
}
