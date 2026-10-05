/**
 * Holds every package gdp-mistakes.ts file to failing for the recorded reasons.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { checkMistakes } from "./check-mistakes.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const PACKAGES = [
  "clawql-gdp",
  "clawql-api",
  "clawql-payments",
  "clawql-auth",
  "clawql-memory",
  "clawql-mcp-events",
] as const;

describe("gdp-ts compile-fail mistakes", () => {
  for (const pkg of PACKAGES) {
    it(`${pkg}: every @ts-expect-error fails for the recorded reason`, () => {
      const project = path.join(repoRoot, "packages", pkg);
      checkMistakes({
        project,
        file: path.join(project, "src/gdp-mistakes.ts"),
        snapshot: path.join(project, "src/gdp-mistakes.snapshot.txt"),
        tsconfig: "tsconfig.gdp-mistakes.json",
      });
    }, 120_000);
  }
});
