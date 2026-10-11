/**
 * Pure information-flow label model for session IFC (ADR 0015).
 *
 * Keep this module free of IO so Lean can mirror `mayFlow` / label growth later.
 * Labels are opaque strings; convention is `source:<specLabel>` (or `public`).
 */

import { Context, Effect, Layer } from "effect";

/** Opaque sensitivity / provenance tag. */
export type Label = string;

/** Public sink / data with no confidentiality constraint. */
export const PUBLIC_LABEL: Label = "public";

export type IfcFlowConfig = {
  /** Destinations that accept any accumulated label (fail-open sinks). */
  readonly publicDestinations: ReadonlySet<Label>;
  /**
   * Per-destination allow-list of source labels that may flow in.
   * A value containing `"*"` accepts every label.
   */
  readonly allowedSourcesByDest: ReadonlyMap<Label, ReadonlySet<Label>>;
};

export const emptyIfcFlowConfig = (): IfcFlowConfig => ({
  publicDestinations: new Set([PUBLIC_LABEL, "source:public"]),
  allowedSourcesByDest: new Map(),
});

/** Build `source:<specLabel>` (or `source:unknown` when missing). */
export const labelForSpec = (specLabel: string | undefined): Label =>
  `source:${(specLabel?.trim() || "unknown").toLowerCase()}`;

/**
 * Whether `fromUnion` may flow into every destination in `destLabels`.
 *
 * Rules (fail closed):
 * 1. Empty `fromUnion` always flows.
 * 2. If any dest is public (config or well-known), allow.
 * 3. Else for each dest: every label in `fromUnion` must be in that dest's
 *    allow-list (config), or — when no allow-list — must equal a dest label
 *    or `public` (same-source writes only).
 */
export function mayFlow(
  fromUnion: ReadonlySet<Label>,
  destLabels: ReadonlySet<Label>,
  config: IfcFlowConfig = emptyIfcFlowConfig()
): boolean {
  if (fromUnion.size === 0) return true;
  if (destLabels.size === 0) return false;

  for (const dest of destLabels) {
    if (config.publicDestinations.has(dest) || dest === PUBLIC_LABEL) {
      continue;
    }
    const allowed = config.allowedSourcesByDest.get(dest);
    if (allowed) {
      if (allowed.has("*")) continue;
      for (const lbl of fromUnion) {
        if (!allowed.has(lbl) && lbl !== PUBLIC_LABEL) return false;
      }
      continue;
    }
    // No explicit allow-list: only public or labels already on the destination.
    for (const lbl of fromUnion) {
      if (lbl !== PUBLIC_LABEL && !destLabels.has(lbl)) return false;
    }
  }
  return true;
}

/** Parse optional JSON config from env (`CLAWQL_SESSION_IFC_ALLOWED`). */
export function parseIfcFlowConfigJson(raw: string | undefined): IfcFlowConfig {
  const base = emptyIfcFlowConfig();
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as {
      publicDestinations?: string[];
      allowedSourcesByDest?: Record<string, string[]>;
    };
    const publicDestinations = new Set(base.publicDestinations);
    for (const p of parsed.publicDestinations ?? []) {
      if (typeof p === "string" && p.trim()) publicDestinations.add(p.trim());
    }
    const allowedSourcesByDest = new Map<Label, ReadonlySet<Label>>();
    for (const [dest, sources] of Object.entries(parsed.allowedSourcesByDest ?? {})) {
      if (!Array.isArray(sources)) continue;
      allowedSourcesByDest.set(
        dest,
        new Set(sources.filter((s): s is string => typeof s === "string" && s.length > 0))
      );
    }
    return { publicDestinations, allowedSourcesByDest };
  } catch {
    return base;
  }
}

export class IfcLabelService extends Context.Service<
  IfcLabelService,
  {
    readonly mayFlow: (
      fromUnion: ReadonlySet<Label>,
      destLabels: ReadonlySet<Label>,
      config?: IfcFlowConfig
    ) => Effect.Effect<boolean>;
    readonly labelForSpec: (specLabel: string | undefined) => Effect.Effect<Label>;
  }
>()("clawql/IfcLabelService") {}

export const IfcLabelLive = Layer.succeed(
  IfcLabelService,
  IfcLabelService.of({
    mayFlow: (fromUnion, destLabels, config) =>
      Effect.sync(() => mayFlow(fromUnion, destLabels, config)),
    labelForSpec: (specLabel) => Effect.sync(() => labelForSpec(specLabel)),
  })
);
