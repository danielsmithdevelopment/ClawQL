import { Cause, Effect, Exit, Layer } from "effect";
import { vaultConfigLiveLayer, VaultConfigService } from "clawql-memory/plugin";
import type { ExternalIngestInput, ExternalIngestResult } from "../ingest/external-ingest.js";
import { DocumentsIngestService, documentsIngestLiveLayer } from "./documents-ingest-service.js";

export type DocumentsServices = VaultConfigService | DocumentsIngestService;

/** Merged Effect Layer for clawql-documents domain services + memory vault config. */
export function documentsServicesLiveLayer(): Layer.Layer<DocumentsServices> {
  return Layer.mergeAll(vaultConfigLiveLayer(), documentsIngestLiveLayer());
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
