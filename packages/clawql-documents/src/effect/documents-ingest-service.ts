import { Context, Effect, Layer } from "effect";
import { MemoryDbService, VaultConfigService } from "clawql-memory/plugin";
import type { ExternalIngestInput, ExternalIngestResult } from "../ingest/external-ingest.js";
import { executeExternalIngestEffect } from "./external-ingest-effect.js";
import { DocumentsError } from "./documents-errors.js";

/** Effect service for external knowledge ingest (`ingest_external_knowledge`). */
export class DocumentsIngestService extends Context.Tag("clawql/DocumentsIngestService")<
  DocumentsIngestService,
  {
    readonly ingest: (
      input: ExternalIngestInput
    ) => Effect.Effect<ExternalIngestResult, DocumentsError, VaultConfigService | MemoryDbService>;
  }
>() {}

export function documentsIngestLiveLayer(): Layer.Layer<DocumentsIngestService> {
  return Layer.succeed(
    DocumentsIngestService,
    DocumentsIngestService.of({
      ingest: executeExternalIngestEffect,
    })
  );
}
