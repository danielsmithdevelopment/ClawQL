#!/usr/bin/env node
/**
 * stdin JSON → runExtractBenchOntologyPipeline → stdout JSON summary.
 *
 * Used by integrations/extractbench/provider/clawql_idp/ontology_sync.py after
 * schema mapping. Requires `npm run build -w clawql-ontology -w clawql-memory`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function main() {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw);
  if (input.vaultRoot?.trim()) {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = input.vaultRoot.trim();
  }
  const mod = await import(join(repoRoot, "packages/clawql-ontology/dist/index.js"));
  const result = await mod.runExtractBenchOntologyPipelinePromise(input);
  const summary = {
    entityId: result.scaffold.entityId,
    populatedFields: result.populatedFields,
    nullFields: result.nullFields,
    rowsPopulated: result.rowsPopulated,
    recall: result.recall,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
