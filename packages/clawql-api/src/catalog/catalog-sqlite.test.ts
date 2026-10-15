import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  writeCatalogSqliteEffect,
  loadCatalogSqliteSlimEffect,
  catalogSqliteEnabled,
  resolveCatalogSqlitePath,
  catalogSqliteBuildOutOfProcess,
  catalogSqliteNeedsRebuild,
} from "./catalog-sqlite.js";
import type { Operation } from "../spec/operation-types.js";
import type { OpenAPIDoc } from "../spec/spec-loader.js";

const op = (id: string, specIndex = 0): Operation => ({
  id,
  method: "GET",
  path: `/x/${id}`,
  flatPath: `/x/${id}`,
  description: `desc ${id}`,
  resource: "x",
  parameters: {},
  scopes: [],
  specIndex,
});

const doc = (title: string): OpenAPIDoc =>
  ({
    openapi: "3.0.0",
    info: { title, version: "1" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }) as OpenAPIDoc;

describe("catalog-sqlite", () => {
  let dir: string;
  let prevHome: string | undefined;
  let prevFlag: string | undefined;
  let prevPath: string | undefined;
  let prevBuild: string | undefined;
  let prevRebuild: string | undefined;
  let prevSpec: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clawql-catalog-sqlite-"));
    prevHome = process.env.CLAWQL_HOME;
    prevFlag = process.env.CLAWQL_CATALOG_SQLITE;
    prevPath = process.env.CLAWQL_CATALOG_SQLITE_PATH;
    prevBuild = process.env.CLAWQL_CATALOG_SQLITE_BUILD;
    prevRebuild = process.env.CLAWQL_CATALOG_SQLITE_REBUILD;
    prevSpec = process.env.CLAWQL_SPEC_PATH;
    process.env.CLAWQL_HOME = dir;
    delete process.env.CLAWQL_CATALOG_SQLITE;
    delete process.env.CLAWQL_CATALOG_SQLITE_PATH;
    delete process.env.CLAWQL_CATALOG_SQLITE_BUILD;
    delete process.env.CLAWQL_CATALOG_SQLITE_REBUILD;
    delete process.env.CLAWQL_SPEC_PATH;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
    if (prevFlag === undefined) delete process.env.CLAWQL_CATALOG_SQLITE;
    else process.env.CLAWQL_CATALOG_SQLITE = prevFlag;
    if (prevPath === undefined) delete process.env.CLAWQL_CATALOG_SQLITE_PATH;
    else process.env.CLAWQL_CATALOG_SQLITE_PATH = prevPath;
    if (prevBuild === undefined) delete process.env.CLAWQL_CATALOG_SQLITE_BUILD;
    else process.env.CLAWQL_CATALOG_SQLITE_BUILD = prevBuild;
    if (prevRebuild === undefined) delete process.env.CLAWQL_CATALOG_SQLITE_REBUILD;
    else process.env.CLAWQL_CATALOG_SQLITE_REBUILD = prevRebuild;
    if (prevSpec === undefined) delete process.env.CLAWQL_SPEC_PATH;
    else process.env.CLAWQL_SPEC_PATH = prevSpec;
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves path under CLAWQL_HOME by default", () => {
    const p = Effect.runSync(resolveCatalogSqlitePath());
    expect(p).toBe(join(dir, "catalog.sqlite"));
    // Default on when unset
    expect(Effect.runSync(catalogSqliteEnabled())).toBe(true);
    process.env.CLAWQL_CATALOG_SQLITE = "0";
    expect(Effect.runSync(catalogSqliteEnabled())).toBe(false);
    process.env.CLAWQL_CATALOG_SQLITE = "1";
    expect(Effect.runSync(catalogSqliteEnabled())).toBe(true);
  });

  it("round-trips operations and lazy openapi", async () => {
    const path = join(dir, "c.sqlite");
    await Effect.runPromise(
      writeCatalogSqliteEffect(path, {
        operations: [op("a"), op("b", 1)],
        openapis: [doc("A"), doc("B")],
        multi: true,
      })
    );
    const slim = await Effect.runPromise(loadCatalogSqliteSlimEffect(path));
    expect(slim.catalogBackend).toBe("sqlite");
    expect(slim.operations.map((o) => o.id)).toEqual(["a", "b"]);
    expect(slim.multi).toBe(true);
    // Lazy materialise
    expect(slim.openapi.info?.title).toBe("A");
    expect(slim.openapis?.[1]?.info?.title).toBe("B");
  });

  it("rejects corrupt sqlite files instead of half-loading", async () => {
    const path = join(dir, "corrupt.sqlite");
    writeFileSync(path, "not-a-sqlite-database");
    await expect(Effect.runPromise(loadCatalogSqliteSlimEffect(path))).rejects.toThrow();
  });

  it("defaults catalog build to out-of-process", () => {
    delete process.env.CLAWQL_CATALOG_SQLITE_BUILD;
    expect(Effect.runSync(catalogSqliteBuildOutOfProcess())).toBe(true);
    process.env.CLAWQL_CATALOG_SQLITE_BUILD = "inprocess";
    expect(Effect.runSync(catalogSqliteBuildOutOfProcess())).toBe(false);
    process.env.CLAWQL_CATALOG_SQLITE_BUILD = "oop";
    expect(Effect.runSync(catalogSqliteBuildOutOfProcess())).toBe(true);
  });

  it("needs rebuild when DB missing; not when DB is newer than local spec", async () => {
    const spec = join(dir, "spec.json");
    writeFileSync(
      spec,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "t", version: "1" },
        paths: {
          "/p": {
            get: { operationId: "p", responses: { "200": { description: "ok" } } },
          },
        },
      })
    );
    process.env.CLAWQL_SPEC_PATH = spec;
    expect(Effect.runSync(catalogSqliteNeedsRebuild())).toBe(true);
    const path = join(dir, "catalog.sqlite");
    await Effect.runPromise(
      writeCatalogSqliteEffect(path, {
        operations: [op("p")],
        openapis: [doc("t")],
      })
    );
    process.env.CLAWQL_CATALOG_SQLITE_PATH = path;
    expect(Effect.runSync(catalogSqliteNeedsRebuild())).toBe(false);
    // Touch spec newer than DB
    const future = new Date(Date.now() + 60_000);
    const { utimesSync } = await import("node:fs");
    utimesSync(spec, future, future);
    expect(Effect.runSync(catalogSqliteNeedsRebuild())).toBe(true);
    delete process.env.CLAWQL_SPEC_PATH;
  });
});
