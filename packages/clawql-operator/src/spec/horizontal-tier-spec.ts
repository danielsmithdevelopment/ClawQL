import { basePluginCompositionFlags, type ClawqlOptionalToolFlags } from "clawql-api";

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

function tierEnabled(
  section: { readonly enabled?: boolean } | undefined,
  fallback: boolean
): boolean {
  return section?.enabled ?? fallback;
}

/**
 * Maps a CRD-style horizontal tier spec onto {@link ClawqlOptionalToolFlags}.
 * Unspecified sections inherit from `defaults` (env by default).
 */
export function optionalFlagsFromHorizontalTierSpec(
  spec: ClawQLHorizontalTierSpec,
  defaults: ClawqlOptionalToolFlags = basePluginCompositionFlags()
): ClawqlOptionalToolFlags {
  return {
    ...defaults,
    enableMemory: tierEnabled(spec.memory, defaults.enableMemory),
    enableDocuments: tierEnabled(spec.documents, defaults.enableDocuments),
    enableOnyxKnowledge: tierEnabled(spec.documents?.onyx, defaults.enableOnyxKnowledge),
    enableIdpPipeline: tierEnabled(spec.documents?.idpPipeline, defaults.enableIdpPipeline),
    enableIdpClassifier: tierEnabled(spec.documents?.idpClassifier, defaults.enableIdpClassifier),
    enableLangextract: tierEnabled(spec.documents?.langextract, defaults.enableLangextract),
    enablePdfInspector: tierEnabled(spec.documents?.pdfInspector, defaults.enablePdfInspector),
    enableAnydoc: tierEnabled(spec.documents?.anydoc, defaults.enableAnydoc),
    enableSchedule: tierEnabled(spec.automation?.schedule, defaults.enableSchedule),
    enableNotify: tierEnabled(spec.automation?.notify, defaults.enableNotify),
    enableWorkflow: tierEnabled(spec.automation?.workflow, defaults.enableWorkflow),
    enableArgoCd: tierEnabled(spec.automation?.argocd, defaults.enableArgoCd),
    enableHitlLabelStudio: tierEnabled(
      spec.automation?.hitlLabelStudio,
      defaults.enableHitlLabelStudio
    ),
    enableSandbox: tierEnabled(spec.sandbox, defaults.enableSandbox),
    enableData: tierEnabled(spec.data, defaults.enableData),
    enableWeb: tierEnabled(spec.web, defaults.enableWeb),
    enableOntology: tierEnabled(spec.ontology, defaults.enableOntology),
    enableOntologyWrites: tierEnabled(spec.ontology?.writes, defaults.enableOntologyWrites),
    // `spec.ouroboros.enabled` is ignored — Ouroboros ships via clawql-harness always.
    enableLangfuseEval: tierEnabled(spec.ouroboros?.langfuseEval, defaults.enableLangfuseEval),
  };
}
