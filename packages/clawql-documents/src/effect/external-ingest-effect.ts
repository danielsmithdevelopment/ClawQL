import { Effect } from "effect";
import { VaultConfigService } from "clawql-memory/plugin";
import {
  executeExternalIngestCore,
  type ExternalIngestInput,
  type ExternalIngestResult,
} from "../ingest/external-ingest.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

/** External ingest pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeExternalIngestEffect(
  input: ExternalIngestInput
): Effect.Effect<ExternalIngestResult, DocumentsError, VaultConfigService> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    return yield* documentsFromPromise(() => executeExternalIngestCore(vault, input));
  });
}
