/**
 * Native Effect.gen staging for ingest_external_knowledge:
 * prelude → prepare/fetch → vault write → MemoryDb post-sync / artifact hints.
 * No nested {@link runMemoryEffect} / {@link runDocumentsEffect}.
 */

import { Effect, Either } from "effect";
import {
  MemoryDbService,
  VaultConfigService,
  vaultArtifactHintsEffect,
  vaultWritePostSyncEffect,
} from "clawql-memory/plugin";
import {
  evaluateExternalIngestPrelude,
  fetchUrlResource,
  prepareMarkdownDocuments,
  writePlannedMarkdownDocuments,
  writeUrlIngestNote,
  type ExternalIngestInput,
  type ExternalIngestResult,
} from "../ingest/external-ingest.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

export type ExternalIngestCoreServices = MemoryDbService;

/**
 * Vault write + post-sync as Effect.gen.
 * fs / fetch / Presidio stay behind {@link documentsFromPromise}; db sync via {@link MemoryDbService}.
 */
export function executeExternalIngestCoreEffect(
  vault: string | null,
  input: ExternalIngestInput
): Effect.Effect<ExternalIngestResult, DocumentsError, ExternalIngestCoreServices> {
  return Effect.gen(function* () {
    const prelude = evaluateExternalIngestPrelude(vault, input);
    if (prelude.kind === "result") {
      return prelude.result;
    }

    if (prelude.kind === "stub") {
      const hints = yield* vaultArtifactHintsEffect(prelude.vault);
      return {
        ok: true,
        stub: true,
        enabled: true,
        vaultConfigured: true,
        message:
          `No import payload. Pass documents: [{ path, markdown }] for Markdown import, or url + source "url" with CLAWQL_EXTERNAL_INGEST_FETCH=1. ` +
          `Preview: source=${JSON.stringify(prelude.srcLabel)}, dryRun=${prelude.dryRun}.`,
        roadmap: [
          "Markdown: pass documents[] with vault-relative .md paths (dryRun defaults true).",
          'URL: set source to "url", pass url (https), scope as optional target path, and CLAWQL_EXTERNAL_INGEST_FETCH=1.',
          "Secrets: per-provider env vars for future Notion/Confluence/GitHub plugins; never logged.",
          "Orchestration: writes use the vault lock; syncMemoryDbForVaultScanRoot + _INDEX_ page after import.",
        ],
        relatedIssues: [40, 24, 25, 27],
        ...hints,
      } satisfies ExternalIngestResult;
    }

    if (prelude.kind === "url") {
      if (prelude.dryRun) {
        const hints = yield* vaultArtifactHintsEffect(prelude.vault);
        return {
          ok: true,
          enabled: true,
          vaultConfigured: true,
          dryRun: true,
          message: `Would fetch ${JSON.stringify(prelude.url)} → ${JSON.stringify(prelude.targetRel)}`,
          importedPaths: [prelude.targetRel],
          ...hints,
        } satisfies ExternalIngestResult;
      }

      const fetchEither = yield* Effect.either(
        documentsFromPromise(() => fetchUrlResource(prelude.url))
      );
      if (Either.isLeft(fetchEither)) {
        const cause = fetchEither.left.cause;
        const msg =
          cause instanceof Error ? cause.message : String(cause ?? fetchEither.left.reason);
        return {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message: `Fetch failed: ${msg}`,
          error: "fetch_failed",
        } satisfies ExternalIngestResult;
      }

      const resource = fetchEither.right;
      yield* documentsFromPromise(() =>
        writeUrlIngestNote(
          prelude.vault,
          prelude.targetRel,
          resource.finalUrl,
          resource.body,
          resource.contentType
        )
      );
      yield* vaultWritePostSyncEffect(prelude.vault);
      const hints = yield* vaultArtifactHintsEffect(prelude.vault);
      return {
        ok: true,
        enabled: true,
        vaultConfigured: true,
        dryRun: false,
        message: `Fetched and wrote ${prelude.targetRel}`,
        importedPaths: [prelude.targetRel],
        ...hints,
      } satisfies ExternalIngestResult;
    }

    // markdown
    const prepared = yield* documentsFromPromise(() =>
      prepareMarkdownDocuments(prelude.documents, prelude.vault)
    );
    if (prepared.planned.length === 0) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: "No valid documents to import.",
        documentErrors: prepared.docErrors,
        error: "no_valid_documents",
      } satisfies ExternalIngestResult;
    }

    if (prelude.dryRun) {
      const hints = yield* vaultArtifactHintsEffect(prelude.vault);
      return {
        ok: true,
        enabled: true,
        vaultConfigured: true,
        dryRun: true,
        message: `Would import ${prepared.planned.length} Markdown file(s).`,
        importedPaths: prepared.planned.map((p) => p.rel),
        documentErrors: prepared.docErrors.length > 0 ? prepared.docErrors : undefined,
        ...hints,
      } satisfies ExternalIngestResult;
    }

    yield* documentsFromPromise(() =>
      writePlannedMarkdownDocuments(prelude.vault, prepared.planned)
    );
    yield* vaultWritePostSyncEffect(prelude.vault);
    const hints = yield* vaultArtifactHintsEffect(prelude.vault);
    return {
      ok: true,
      enabled: true,
      vaultConfigured: true,
      dryRun: false,
      message: `Imported ${prepared.planned.length} Markdown file(s).`,
      importedPaths: prepared.planned.map((p) => p.rel),
      documentErrors: prepared.docErrors.length > 0 ? prepared.docErrors : undefined,
      ...hints,
    } satisfies ExternalIngestResult;
  });
}

/** External ingest pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeExternalIngestEffect(
  input: ExternalIngestInput
): Effect.Effect<
  ExternalIngestResult,
  DocumentsError,
  VaultConfigService | ExternalIngestCoreServices
> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    return yield* executeExternalIngestCoreEffect(vault, input);
  });
}
