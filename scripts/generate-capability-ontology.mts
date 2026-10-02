#!/usr/bin/env npx tsx
/**
 * Generate capability ontology JSON + digest from the frozen routing catalog
 * (+ optional hint overlay). Does not rename tool IDs.
 *
 * Usage:
 *   npx tsx scripts/generate-capability-ontology.mts
 *   npx tsx scripts/generate-capability-ontology.mts --overlay path/to/hints.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIGEST_FILENAME,
  GENERATED_FILENAME,
} from "../packages/clawql-core/src/classifier/capability-ontology.js";
import {
  generateCapabilityOntology,
  loadCatalogSource,
  loadHintOverlay,
} from "../packages/clawql-core/src/classifier/generate-capability-ontology.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir =
  argValue("--out-dir") ?? join(root, "packages/clawql-core/src/classifier/fixtures");
const overlayPath =
  argValue("--overlay") ??
  join(root, "packages/clawql-core/src/classifier/fixtures/capability-routing-hints.overlay.json");

const catalog = loadCatalogSource();
const overlay = loadHintOverlay(overlayPath);
const ontology = generateCapabilityOntology({ catalog, overlay });

mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, GENERATED_FILENAME);
const digestPath = join(outDir, DIGEST_FILENAME);
writeFileSync(jsonPath, `${JSON.stringify(ontology, null, 2)}\n`);
writeFileSync(digestPath, `${ontology.digestSha256}\n`);
console.error(
  `wrote ${jsonPath} caps=${ontology.capabilities.length} digest=${ontology.digestSha256}`
);
console.log(
  JSON.stringify({
    ontologyId: ontology.ontologyId,
    digestSha256: ontology.digestSha256,
    capabilityCount: ontology.capabilities.length,
    catalogId: catalog.catalogId,
    overlayPath,
  })
);
