import { clawqlProvidersCompositionSchema } from "clawql-api";
import { z } from "zod";
import type { ClawQLHorizontalTierSpec } from "./horizontal-tier-spec.js";
import { applyTierPreset } from "./tier-presets.js";

const tierToggleSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict()
  .optional();

export const clawqlInstanceSpecV1Alpha1Schema = z
  .object({
    tier: z.enum(["local", "standard", "enterprise"]).optional(),
    /**
     * Bundled OpenAPI/GraphQL catalog selection — available in the image, loaded only when opted in.
     * Prefer this over `CLAWQL_PROVIDER` / `CLAWQL_ENABLE_GOOGLE|AWS|CLOUDFLARE`.
     */
    providers: clawqlProvidersCompositionSchema.optional(),
    memory: tierToggleSchema,
    documents: z
      .object({
        enabled: z.boolean().optional(),
        onyx: tierToggleSchema,
        idpPipeline: tierToggleSchema,
        idpClassifier: tierToggleSchema,
        langextract: tierToggleSchema,
        pdfInspector: tierToggleSchema,
        anydoc: tierToggleSchema,
        coneshare: tierToggleSchema,
      })
      .strict()
      .optional(),
    automation: z
      .object({
        schedule: tierToggleSchema,
        notify: tierToggleSchema,
        workflow: tierToggleSchema,
        argocd: tierToggleSchema,
        hitlLabelStudio: tierToggleSchema,
      })
      .strict()
      .optional(),
    sandbox: tierToggleSchema,
    data: tierToggleSchema,
    web: tierToggleSchema,
    ontology: z
      .object({
        enabled: z.boolean().optional(),
        writes: tierToggleSchema,
      })
      .strict()
      .optional(),
    ouroboros: z
      .object({
        enabled: z.boolean().optional(),
        langfuseEval: tierToggleSchema,
      })
      .strict()
      .optional(),
    mcp: z
      .object({
        deploymentName: z.string().min(1).optional(),
        namespace: z.string().min(1).optional(),
        rolloutOnTierSpecChange: z.boolean().optional(),
        /** Kubernetes Secret synced from Vault (`envFromSecret`); defaults to clawql-provider-env. */
        providerSecretName: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ClawQLInstanceSpecV1Alpha1 = z.infer<typeof clawqlInstanceSpecV1Alpha1Schema>;

export type ClawQLInstanceStatusV1Alpha1 = {
  phase?: "Pending" | "Reconciling" | "Ready" | "Degraded";
  observedGeneration?: number;
  configMapName?: string;
  message?: string;
  conditions?: readonly {
    type: string;
    status: "True" | "False" | "Unknown";
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }[];
};

/** Maps validated ClawQLInstance spec to horizontal tier toggles for Layer composition. */
export function clawqlInstanceSpecToHorizontalTierSpec(
  spec: ClawQLInstanceSpecV1Alpha1
): ClawQLHorizontalTierSpec {
  return {
    memory: spec.memory,
    documents: spec.documents,
    automation: spec.automation,
    sandbox: spec.sandbox,
    data: spec.data,
    web: spec.web,
    ontology: spec.ontology,
    ouroboros: spec.ouroboros,
  };
}

export function parseClawqlInstanceSpec(raw: unknown): ClawQLInstanceSpecV1Alpha1 {
  const parsed = clawqlInstanceSpecV1Alpha1Schema.parse(raw);
  return applyTierPreset(parsed);
}
