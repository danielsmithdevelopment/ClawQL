import { Cause, Effect, Exit, Layer } from "effect";
import { vaultConfigLiveLayer, VaultConfigService } from "clawql-memory/plugin";
import type { ExternalIngestInput, ExternalIngestResult } from "../ingest/external-ingest.js";
import type {
  ClassifyDocumentInput,
  ClassifyDocumentResult,
} from "../classify/classify-document.js";
import type {
  ExtractDocumentInput,
  ExtractDocumentResult,
} from "../langextract/extract-document.js";
import type { RunIdpPipelineInput, RunIdpPipelineResult } from "../pipeline/runner.js";
import { DocumentsIngestService, documentsIngestLiveLayer } from "./documents-ingest-service.js";
import { DocumentsToolsService, documentsToolsLiveLayer } from "./documents-tools-service.js";

export type DocumentsServices = VaultConfigService | DocumentsIngestService | DocumentsToolsService;

/** Merged Effect Layer for clawql-documents domain services + memory vault config. */
export function documentsServicesLiveLayer(): Layer.Layer<DocumentsServices> {
  return Layer.mergeAll(
    vaultConfigLiveLayer(),
    documentsIngestLiveLayer(),
    documentsToolsLiveLayer()
  );
}

/** Run a documents Effect program with default services Layer. */
export async function runDocumentsEffect<A, E>(
  program: Effect.Effect<A, E, DocumentsServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(documentsServicesLiveLayer()))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** External ingest via Effect services (used by {@link runIngestExternalKnowledge}). */
export function documentsIngestProgram(
  input: ExternalIngestInput
): Effect.Effect<ExternalIngestResult, unknown, DocumentsServices> {
  return Effect.gen(function* () {
    const ingest = yield* DocumentsIngestService;
    return yield* ingest.ingest(input);
  });
}

/** IDP pipeline via Effect services. */
export function documentsIdpPipelineProgram(
  input: RunIdpPipelineInput
): Effect.Effect<RunIdpPipelineResult, unknown, DocumentsServices> {
  return Effect.gen(function* () {
    const tools = yield* DocumentsToolsService;
    return yield* tools.runIdpPipeline(input);
  });
}

/** Classify document via Effect services. */
export function documentsClassifyProgram(
  input: ClassifyDocumentInput
): Effect.Effect<ClassifyDocumentResult, unknown, DocumentsServices> {
  return Effect.gen(function* () {
    const tools = yield* DocumentsToolsService;
    return yield* tools.classify(input);
  });
}

/** Extract document via Effect services. */
export function documentsExtractProgram(
  input: ExtractDocumentInput
): Effect.Effect<ExtractDocumentResult, unknown, DocumentsServices> {
  return Effect.gen(function* () {
    const tools = yield* DocumentsToolsService;
    return yield* tools.extract(input);
  });
}
