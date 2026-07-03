import { z } from "zod";
import type { ClawQLHorizontalTierSpec } from "./horizontal-tier-spec.js";

const tierToggleSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict()
  .optional();

export const clawqlInstanceSpecV1Alpha1Schema = z
  .object({
    tier: z.enum(["local", "standard", "enterprise"]).optional(),
    memory: tierToggleSchema,
    documents: z
      .object({
        enabled: z.boolean().optional(),
        onyx: tierToggleSchema,
        idpPipeline: tierToggleSchema,
        idpClassifier: tierToggleSchema,
        langextract: tierToggleSchema,
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
    ouroboros: z
      .object({
        enabled: z.boolean().optional(),
        langfuseEval: tierToggleSchema,
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
    ouroboros: spec.ouroboros,
  };
}

export function parseClawqlInstanceSpec(raw: unknown): ClawQLInstanceSpecV1Alpha1 {
  return clawqlInstanceSpecV1Alpha1Schema.parse(raw);
}
