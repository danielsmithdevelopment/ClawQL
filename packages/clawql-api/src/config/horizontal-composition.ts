/**
 * Horizontal plugin composition from ClawQLInstance / tier — shared by MCP and packages.
 * Authoritative for plugin enablement; `CLAWQL_ENABLE_*` is legacy when instance is unset.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ClawqlOptionalToolFlags } from "./optional-flags.js";

/** Horizontal tier toggles shared by ClawQLInstance CRD and Layer composition. */
export type ClawQLHorizontalTierSpec = {
  readonly memory?: { readonly enabled?: boolean };
  readonly documents?: {
    readonly enabled?: boolean;
    readonly onyx?: { readonly enabled?: boolean };
    readonly idpPipeline?: { readonly enabled?: boolean };
    readonly idpClassifier?: { readonly enabled?: boolean };
    readonly langextract?: { readonly enabled?: boolean };
    readonly pdfInspector?: { readonly enabled?: boolean };
    readonly anydoc?: { readonly enabled?: boolean };
    readonly coneshare?: { readonly enabled?: boolean };
  };
  readonly automation?: {
    readonly schedule?: { readonly enabled?: boolean };
    readonly notify?: { readonly enabled?: boolean };
    readonly workflow?: { readonly enabled?: boolean };
    readonly argocd?: { readonly enabled?: boolean };
    readonly hitlLabelStudio?: { readonly enabled?: boolean };
  };
  readonly sandbox?: { readonly enabled?: boolean };
  readonly data?: { readonly enabled?: boolean };
  readonly web?: { readonly enabled?: boolean };
  readonly ontology?: {
    readonly enabled?: boolean;
    readonly writes?: { readonly enabled?: boolean };
  };
  readonly ouroboros?: {
    /** @deprecated Ignored — Ouroboros tools always load via clawql-harness. */
    readonly enabled?: boolean;
    readonly langfuseEval?: { readonly enabled?: boolean };
  };
};

const toggle = z.object({ enabled: z.boolean().optional() }).strict().optional();

/** Loose instance body for flag resolution (providers schema validated elsewhere). */
const instanceBodyForFlagsSchema = z
  .object({
    tier: z.enum(["local", "standard", "enterprise"]).optional(),
    memory: toggle,
    documents: z
      .object({
        enabled: z.boolean().optional(),
        onyx: toggle,
        idpPipeline: toggle,
        idpClassifier: toggle,
        langextract: toggle,
        pdfInspector: toggle,
        anydoc: toggle,
        coneshare: toggle,
      })
      .strict()
      .optional(),
    automation: z
      .object({
        schedule: toggle,
        notify: toggle,
        workflow: toggle,
        argocd: toggle,
        hitlLabelStudio: toggle,
      })
      .strict()
      .optional(),
    sandbox: toggle,
    data: toggle,
    web: toggle,
    ontology: z
      .object({
        enabled: z.boolean().optional(),
        writes: toggle,
      })
      .strict()
      .optional(),
    ouroboros: z
      .object({
        enabled: z.boolean().optional(),
        langfuseEval: toggle,
      })
      .strict()
      .optional(),
  })
  .passthrough();

type InstanceBodyForFlags = z.infer<typeof instanceBodyForFlagsSchema>;

const TIER_PRESET_HORIZONTAL: Record<
  "local" | "standard" | "enterprise",
  ClawQLHorizontalTierSpec
> = {
  local: {
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

function tierEnabled(
  section: { readonly enabled?: boolean } | undefined,
  fallback: boolean
): boolean {
  return section?.enabled ?? fallback;
}

/**
 * Maps a CRD-style horizontal tier spec onto {@link ClawqlOptionalToolFlags}.
 * Unspecified sections inherit from `defaults` (or a safe baseline when omitted).
 */
export function optionalFlagsFromHorizontalTierSpec(
  spec: ClawQLHorizontalTierSpec,
  defaults?: ClawqlOptionalToolFlags
): ClawqlOptionalToolFlags {
  const d: ClawqlOptionalToolFlags = defaults ?? {
    enableGrpc: false,
    enableGrpcReflection: false,
    externalIngestPreview: false,
    enableMemory: true,
    enableDocuments: true,
    enableSchedule: false,
    enableNotify: false,
    enableWorkflow: false,
    enableArgoCd: false,
    enableVision: false,
    enableOnyxKnowledge: false,
    enableSandbox: false,
    enableData: false,
    enableWeb: false,
    enableCodeGraph: false,
    enableOntology: false,
    enableOntologyWrites: false,
    enableHitlLabelStudio: false,
    enableConeshare: false,
    enableIdpPipeline: false,
    enableIdpClassifier: false,
    enableLangextract: false,
    enablePdfInspector: false,
    enableAnydoc: false,
    enableLangfuseEval: false,
    enableGoogle: false,
    enableCloudflare: true,
    enableAws: false,
  };
  return {
    ...d,
    enableMemory: tierEnabled(spec.memory, d.enableMemory),
    enableDocuments: tierEnabled(spec.documents, d.enableDocuments),
    enableOnyxKnowledge: tierEnabled(spec.documents?.onyx, d.enableOnyxKnowledge),
    enableIdpPipeline: tierEnabled(spec.documents?.idpPipeline, d.enableIdpPipeline),
    enableIdpClassifier: tierEnabled(spec.documents?.idpClassifier, d.enableIdpClassifier),
    enableLangextract: tierEnabled(spec.documents?.langextract, d.enableLangextract),
    enablePdfInspector: tierEnabled(spec.documents?.pdfInspector, d.enablePdfInspector),
    enableAnydoc: tierEnabled(spec.documents?.anydoc, d.enableAnydoc),
    enableConeshare: tierEnabled(spec.documents?.coneshare, d.enableConeshare),
    enableSchedule: tierEnabled(spec.automation?.schedule, d.enableSchedule),
    enableNotify: tierEnabled(spec.automation?.notify, d.enableNotify),
    enableWorkflow: tierEnabled(spec.automation?.workflow, d.enableWorkflow),
    enableArgoCd: tierEnabled(spec.automation?.argocd, d.enableArgoCd),
    enableHitlLabelStudio: tierEnabled(spec.automation?.hitlLabelStudio, d.enableHitlLabelStudio),
    enableSandbox: tierEnabled(spec.sandbox, d.enableSandbox),
    enableData: tierEnabled(spec.data, d.enableData),
    enableWeb: tierEnabled(spec.web, d.enableWeb),
    enableOntology: tierEnabled(spec.ontology, d.enableOntology),
    enableOntologyWrites: tierEnabled(spec.ontology?.writes, d.enableOntologyWrites),
    enableLangfuseEval: tierEnabled(spec.ouroboros?.langfuseEval, d.enableLangfuseEval),
  };
}

function mergeToggle(
  base: { enabled?: boolean } | undefined,
  override: { enabled?: boolean } | undefined
): { enabled?: boolean } | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

function mergeHorizontal(
  base: ClawQLHorizontalTierSpec,
  override: InstanceBodyForFlags
): ClawQLHorizontalTierSpec {
  return {
    memory: mergeToggle(base.memory, override.memory),
    documents: {
      ...base.documents,
      ...override.documents,
      onyx: mergeToggle(base.documents?.onyx, override.documents?.onyx),
      idpPipeline: mergeToggle(base.documents?.idpPipeline, override.documents?.idpPipeline),
      idpClassifier: mergeToggle(base.documents?.idpClassifier, override.documents?.idpClassifier),
      langextract: mergeToggle(base.documents?.langextract, override.documents?.langextract),
      pdfInspector: mergeToggle(base.documents?.pdfInspector, override.documents?.pdfInspector),
      anydoc: mergeToggle(base.documents?.anydoc, override.documents?.anydoc),
      coneshare: mergeToggle(base.documents?.coneshare, override.documents?.coneshare),
    },
    automation: {
      ...base.automation,
      ...override.automation,
      schedule: mergeToggle(base.automation?.schedule, override.automation?.schedule),
      notify: mergeToggle(base.automation?.notify, override.automation?.notify),
      workflow: mergeToggle(base.automation?.workflow, override.automation?.workflow),
      argocd: mergeToggle(base.automation?.argocd, override.automation?.argocd),
      hitlLabelStudio: mergeToggle(
        base.automation?.hitlLabelStudio,
        override.automation?.hitlLabelStudio
      ),
    },
    sandbox: mergeToggle(base.sandbox, override.sandbox),
    data: mergeToggle(base.data, override.data),
    web: mergeToggle(base.web, override.web),
    ontology: {
      ...base.ontology,
      ...override.ontology,
      writes: mergeToggle(base.ontology?.writes, override.ontology?.writes),
    },
    ouroboros: {
      ...base.ouroboros,
      ...override.ouroboros,
      langfuseEval: mergeToggle(base.ouroboros?.langfuseEval, override.ouroboros?.langfuseEval),
    },
  };
}

function instanceBodyToHorizontal(body: InstanceBodyForFlags): ClawQLHorizontalTierSpec {
  return {
    memory: body.memory,
    documents: body.documents,
    automation: body.automation,
    sandbox: body.sandbox,
    data: body.data,
    web: body.web,
    ontology: body.ontology,
    ouroboros: body.ouroboros,
  };
}

function parseInstanceDocument(raw: unknown): InstanceBodyForFlags | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const root = raw as Record<string, unknown>;
  const body =
    root.spec && typeof root.spec === "object" && !Array.isArray(root.spec) ? root.spec : root;
  const parsed = instanceBodyForFlagsSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/** Load instance body for composition when `CLAWQL_INSTANCE_SPEC` / `_FILE` is set. */
export function readInstanceBodyForFlagsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): InstanceBodyForFlags | undefined {
  const inline = env.CLAWQL_INSTANCE_SPEC?.trim();
  if (inline) {
    try {
      return parseInstanceDocument(JSON.parse(inline) as unknown);
    } catch {
      return undefined;
    }
  }
  const filePath = env.CLAWQL_INSTANCE_SPEC_FILE?.trim();
  if (!filePath) return undefined;
  try {
    const text = readFileSync(filePath, "utf8").trim();
    const parsed = text.startsWith("{") ? JSON.parse(text) : parseYaml(text);
    return parseInstanceDocument(parsed);
  } catch {
    return undefined;
  }
}

function transportFromEnv(
  env: NodeJS.ProcessEnv
): Pick<ClawqlOptionalToolFlags, "enableGrpc" | "enableGrpcReflection" | "externalIngestPreview"> {
  const t = (v: string | undefined) => {
    const s = v?.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  };
  return {
    enableGrpc: t(env.ENABLE_GRPC),
    enableGrpcReflection: t(env.ENABLE_GRPC_REFLECTION),
    externalIngestPreview: env.CLAWQL_EXTERNAL_INGEST?.trim() === "1",
  };
}

function tierFromEnv(env: NodeJS.ProcessEnv): "local" | "standard" | "enterprise" {
  const raw = env.CLAWQL_TIER?.trim().toLowerCase();
  if (raw === "local" || raw === "standard" || raw === "enterprise") return raw;
  return "standard";
}

/**
 * Resolve plugin composition flags.
 *
 * Precedence:
 * 1. `CLAWQL_INSTANCE_SPEC` / `CLAWQL_INSTANCE_SPEC_FILE` (+ tier preset fill)
 * 2. Else `CLAWQL_TIER` preset
 * 3. Else `legacyEnvFlags` (CLAWQL_ENABLE_* path) or `baseDefaults`
 *
 * Transport (`ENABLE_GRPC`) always comes from env.
 */
export function resolveCompositionFlagsFromEnv(
  env: NodeJS.ProcessEnv,
  baseDefaults: ClawqlOptionalToolFlags,
  legacyEnvFlags?: ClawqlOptionalToolFlags
): ClawqlOptionalToolFlags {
  const transport = transportFromEnv(env);
  const providerStack = {
    enableGoogle: false,
    enableAws: false,
    enableCloudflare: true,
  } as const;

  const instance = readInstanceBodyForFlagsFromEnv(env);
  if (instance) {
    const tier = instance.tier ?? tierFromEnv(env);
    const merged = mergeHorizontal(TIER_PRESET_HORIZONTAL[tier], instance);
    return {
      ...optionalFlagsFromHorizontalTierSpec(merged, baseDefaults),
      ...transport,
      ...providerStack,
    };
  }

  if (env.CLAWQL_TIER?.trim()) {
    const tier = tierFromEnv(env);
    return {
      ...optionalFlagsFromHorizontalTierSpec(TIER_PRESET_HORIZONTAL[tier], baseDefaults),
      ...transport,
      ...providerStack,
    };
  }

  if (legacyEnvFlags) {
    return {
      ...legacyEnvFlags,
      ...transport,
      ...providerStack,
    };
  }

  return {
    ...baseDefaults,
    ...transport,
    ...providerStack,
  };
}
