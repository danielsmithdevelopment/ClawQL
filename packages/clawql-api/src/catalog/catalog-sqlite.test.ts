import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  writeCatalogSqliteEffect,
  loadCatalogSqliteSlimEffect,
  catalogSqliteEnabled,
  resolveCatalogSqlitePath,
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

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clawql-catalog-sqlite-"));
    prevHome = process.env.CLAWQL_HOME;
    prevFlag = process.env.CLAWQL_CATALOG_SQLITE;
    prevPath = process.env.CLAWQL_CATALOG_SQLITE_PATH;
    process.env.CLAWQL_HOME = dir;
    delete process.env.CLAWQL_CATALOG_SQLITE;
    delete process.env.CLAWQL_CATALOG_SQLITE_PATH;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
    if (prevFlag === undefined) delete process.env.CLAWQL_CATALOG_SQLITE;
    else process.env.CLAWQL_CATALOG_SQLITE = prevFlag;
    if (prevPath === undefined) delete process.env.CLAWQL_CATALOG_SQLITE_PATH;
    else process.env.CLAWQL_CATALOG_SQLITE_PATH = prevPath;
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves path under CLAWQL_HOME by default", () => {
    const p = Effect.runSync(resolveCatalogSqlitePath());
    expect(p).toBe(join(dir, "catalog.sqlite"));
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
});
