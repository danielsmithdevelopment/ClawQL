import type { ClawQLInstanceSpecV1Alpha1 } from "./clawql-instance-v1alpha1.js";

/** Opinionated horizontal toggles per deployment tier (design doc §4.1). User spec overrides preset fields. */
export const TIER_PRESET_SPECS: Record<
  NonNullable<ClawQLInstanceSpecV1Alpha1["tier"]>,
  ClawQLInstanceSpecV1Alpha1
> = {
  local: {
    tier: "local",
    memory: { enabled: true },
    documents: { enabled: false },
    automation: {
      schedule: { enabled: false },
      notify: { enabled: false },
      workflow: { enabled: false },
      argocd: { enabled: false },
      hitlLabelStudio: { enabled: false },
    },
    sandbox: { enabled: false },
    data: { enabled: false },
    ouroboros: { enabled: false },
  },
  standard: {
    tier: "standard",
    memory: { enabled: true },
    documents: { enabled: true, onyx: { enabled: false } },
    automation: {
      schedule: { enabled: false },
      notify: { enabled: false },
      workflow: { enabled: false },
      argocd: { enabled: false },
      hitlLabelStudio: { enabled: false },
    },
    sandbox: { enabled: false },
    data: { enabled: false },
    ouroboros: { enabled: false },
  },
  enterprise: {
    tier: "enterprise",
    memory: { enabled: true },
    documents: {
      enabled: true,
      onyx: { enabled: true },
      idpPipeline: { enabled: true },
      idpClassifier: { enabled: false },
      langextract: { enabled: false },
    },
    automation: {
      schedule: { enabled: true },
      notify: { enabled: true },
      workflow: { enabled: true },
      argocd: { enabled: false },
      hitlLabelStudio: { enabled: false },
    },
    sandbox: { enabled: false },
    data: { enabled: false },
    ouroboros: { enabled: false },
  },
};

function mergeToggleSection<T extends { enabled?: boolean }>(
  base: T | undefined,
  override: T | undefined
): T | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

function mergeDocuments(
  base: ClawQLInstanceSpecV1Alpha1["documents"],
  override: ClawQLInstanceSpecV1Alpha1["documents"]
): ClawQLInstanceSpecV1Alpha1["documents"] {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
    onyx: mergeToggleSection(base?.onyx, override?.onyx),
    idpPipeline: mergeToggleSection(base?.idpPipeline, override?.idpPipeline),
    idpClassifier: mergeToggleSection(base?.idpClassifier, override?.idpClassifier),
    langextract: mergeToggleSection(base?.langextract, override?.langextract),
  };
}

function mergeAutomation(
  base: ClawQLInstanceSpecV1Alpha1["automation"],
  override: ClawQLInstanceSpecV1Alpha1["automation"]
): ClawQLInstanceSpecV1Alpha1["automation"] {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
    schedule: mergeToggleSection(base?.schedule, override?.schedule),
    notify: mergeToggleSection(base?.notify, override?.notify),
    workflow: mergeToggleSection(base?.workflow, override?.workflow),
    argocd: mergeToggleSection(base?.argocd, override?.argocd),
    hitlLabelStudio: mergeToggleSection(base?.hitlLabelStudio, override?.hitlLabelStudio),
  };
}

function mergeOuroboros(
  base: ClawQLInstanceSpecV1Alpha1["ouroboros"],
  override: ClawQLInstanceSpecV1Alpha1["ouroboros"]
): ClawQLInstanceSpecV1Alpha1["ouroboros"] {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
    langfuseEval: mergeToggleSection(base?.langfuseEval, override?.langfuseEval),
  };
}

/** Apply tier preset defaults; explicit user fields win. Defaults to `standard` when tier omitted. */
export function applyTierPreset(spec: ClawQLInstanceSpecV1Alpha1): ClawQLInstanceSpecV1Alpha1 {
  const tier = spec.tier ?? "standard";
  const preset = TIER_PRESET_SPECS[tier];
  return {
    tier,
    memory: mergeToggleSection(preset.memory, spec.memory),
    documents: mergeDocuments(preset.documents, spec.documents),
    automation: mergeAutomation(preset.automation, spec.automation),
    sandbox: mergeToggleSection(preset.sandbox, spec.sandbox),
    data: mergeToggleSection(preset.data, spec.data),
    ouroboros: mergeOuroboros(preset.ouroboros, spec.ouroboros),
    mcp: spec.mcp,
  };
}
