import { defineConfig } from "tsup";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const heldOutFixtures = join(root, "src/classifier/held-out/fixtures");
const classifierFixtures = join(root, "src/classifier/fixtures");

export default defineConfig({
  entry: ["src/index.ts", "src/streams-slim.ts", "src/classifier/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "effect", "cbor", "debug", "express", "express-rate-limit"],
  async onSuccess() {
    // Keep Harvey / held-out JSON reachable next to published package sources.
    const dest = join(root, "dist/held-out-fixtures");
    mkdirSync(dest, { recursive: true });
    for (const name of [
      "fast-decision-held-out-v0.1.json",
      "fast-decision-held-out-v0.2-harvey.json",
      "fast-decision-held-out-v0.3-routing-fresh.json",
      "HARVEY_V02_PROVENANCE.md",
      "ONTOLOGY_ENRICHMENT_EVAL_LOG.md",
      "FREEZE-v0.3-routing-fresh.md",
      "routing-fresh-v0.3-source-catalog.json",
    ]) {
      cpSync(join(heldOutFixtures, name), join(dest, name));
    }
    const capDest = join(root, "dist/classifier-fixtures");
    mkdirSync(capDest, { recursive: true });
    cpSync(
      join(classifierFixtures, "clawql-capability-ontology.json"),
      join(capDest, "clawql-capability-ontology.json")
    );
  },
});
