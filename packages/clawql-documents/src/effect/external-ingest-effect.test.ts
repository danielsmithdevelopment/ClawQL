import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import {
  executeExternalIngestCoreEffect,
  executeExternalIngestEffect,
} from "./external-ingest-effect.js";

describe("executeExternalIngestEffect", () => {
  it("returns disabled stub when CLAWQL_EXTERNAL_INGEST is unset", async () => {
    const saved = process.env.CLAWQL_EXTERNAL_INGEST;
    delete process.env.CLAWQL_EXTERNAL_INGEST;
    try {
      const result = await Effect.runPromise(
        executeExternalIngestEffect({ source: "notion" }).pipe(
          Effect.provide(documentsServicesLiveLayer())
        )
      );
      expect(result.ok).toBe(false);
      expect(result.enabled).toBe(false);
      expect(result.stub).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
      else process.env.CLAWQL_EXTERNAL_INGEST = saved;
    }
  });
});

describe("executeExternalIngestCoreEffect", () => {
  let home: string;
  let prevVault: string | undefined;
  let prevIngest: string | undefined;
  let prevMemoryDb: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-docs-ingest-native-"));
    prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    prevIngest = process.env.CLAWQL_EXTERNAL_INGEST;
    prevMemoryDb = process.env.CLAWQL_MEMORY_DB;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_MEMORY_DB = "0";
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    if (prevIngest === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
    else process.env.CLAWQL_EXTERNAL_INGEST = prevIngest;
    if (prevMemoryDb === undefined) delete process.env.CLAWQL_MEMORY_DB;
    else process.env.CLAWQL_MEMORY_DB = prevMemoryDb;
    await rm(home, { recursive: true, force: true });
  });

  it("stages prepare → vault write without nested runMemoryEffect", async () => {
    const result = await Effect.runPromise(
      executeExternalIngestCoreEffect(home, {
        dryRun: false,
        documents: [
          {
            path: "Memory/external/native-effect.md",
            markdown: "# Native Effect ingest\n\nstaged pipeline\n",
          },
        ],
      }).pipe(Effect.provide(documentsServicesLiveLayer()))
    );

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.importedPaths).toEqual(["Memory/external/native-effect.md"]);
    const body = await readFile(join(home, "Memory", "external", "native-effect.md"), "utf8");
    expect(body).toContain("staged pipeline");
  });

  it("dry-run skips vault writes", async () => {
    const result = await Effect.runPromise(
      executeExternalIngestCoreEffect(home, {
        dryRun: true,
        documents: [
          {
            path: "Memory/external/dry.md",
            markdown: "would write",
          },
        ],
      }).pipe(Effect.provide(documentsServicesLiveLayer()))
    );

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.importedPaths).toEqual(["Memory/external/dry.md"]);
    await expect(readFile(join(home, "Memory", "external", "dry.md"), "utf8")).rejects.toThrow();
  });
});
