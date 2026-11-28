import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWormTrailConfigFromEnvEffect,
  defaultWormSqlitePath,
  wormBackendStatusFromConfig,
} from "./env-config.js";
import { MemoryBackend } from "./storage/memory.js";
import { SQLiteBackend } from "./storage/sqlite.js";

describe("createWormTrailConfigFromEnvEffect defaults", () => {
  const prev: Record<string, string | undefined> = {};
  const keys = [
    "CLAWQL_WORM_ENABLED",
    "CLAWQL_WORM_LOCAL",
    "CLAWQL_WORM_REMOTE",
    "CLAWQL_WORM_SQLITE_PATH",
    "CLAWQL_WORM_POSTGRES_URL",
    "CLAWQL_WORM_S3_BUCKET",
    "CLAWQL_WORM_S3_ACCESS_KEY_ID",
    "CLAWQL_WORM_S3_SECRET_ACCESS_KEY",
    "CLAWQL_WORM_S3_ENDPOINT",
    "CLAWQL_HOME",
    "CLAWQL_TIER",
  ] as const;

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
      delete prev[k];
    }
  });

  function stash(): void {
    for (const k of keys) {
      prev[k] = process.env[k];
    }
  }

  it("defaults local to sqlite under CLAWQL_HOME/worm", async () => {
    stash();
    const home = mkdtempSync(join(tmpdir(), "clawql-worm-home-"));
    try {
      process.env.CLAWQL_HOME = home;
      delete process.env.CLAWQL_WORM_LOCAL;
      delete process.env.CLAWQL_WORM_SQLITE_PATH;
      process.env.CLAWQL_WORM_ENABLED = "1";
      process.env.CLAWQL_WORM_REMOTE = "memory";
      delete process.env.CLAWQL_TIER;

      const config = await Effect.runPromise(createWormTrailConfigFromEnvEffect(process.env));
      expect(config).not.toBeNull();
      expect(config!.local).toBeInstanceOf(SQLiteBackend);
      expect(config!.remote).toBeInstanceOf(MemoryBackend);
      const status = wormBackendStatusFromConfig(config!);
      expect(status).toEqual({ local: "sqlite", remote: "memory", localDurable: true });
      expect(defaultWormSqlitePath(process.env)).toBe(join(home, "worm", "clawql-worm.sqlite"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("allows explicit memory local outside regulated", async () => {
    stash();
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    delete process.env.CLAWQL_TIER;

    const config = await Effect.runPromise(createWormTrailConfigFromEnvEffect(process.env));
    expect(config!.local).toBeInstanceOf(MemoryBackend);
    expect(wormBackendStatusFromConfig(config!).localDurable).toBe(false);
  });

  it("regulated refuses memory local", async () => {
    stash();
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_TIER = "regulated";

    const exit = await Effect.runPromiseExit(createWormTrailConfigFromEnvEffect(process.env));
    expect(exit._tag).toBe("Failure");
    const msg = String(exit);
    expect(msg).toMatch(/refuses CLAWQL_WORM_LOCAL=memory/);
  });

  it("regulated refuses memory remote even with sqlite local", async () => {
    stash();
    const home = mkdtempSync(join(tmpdir(), "clawql-worm-reg-"));
    try {
      process.env.CLAWQL_HOME = home;
      process.env.CLAWQL_WORM_ENABLED = "1";
      delete process.env.CLAWQL_WORM_LOCAL;
      process.env.CLAWQL_WORM_REMOTE = "memory";
      process.env.CLAWQL_TIER = "regulated";

      const exit = await Effect.runPromiseExit(createWormTrailConfigFromEnvEffect(process.env));
      expect(exit._tag).toBe("Failure");
      expect(String(exit)).toMatch(/refuses CLAWQL_WORM_REMOTE=memory/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("s3 refuses partial credentials (access key without secret)", async () => {
    stash();
    const home = mkdtempSync(join(tmpdir(), "clawql-worm-partial-s3-"));
    try {
      process.env.CLAWQL_HOME = home;
      process.env.CLAWQL_WORM_ENABLED = "1";
      delete process.env.CLAWQL_WORM_LOCAL;
      process.env.CLAWQL_WORM_REMOTE = "s3";
      process.env.CLAWQL_WORM_S3_BUCKET = "clawql-worm";
      process.env.CLAWQL_WORM_S3_ACCESS_KEY_ID = "test";
      delete process.env.CLAWQL_WORM_S3_SECRET_ACCESS_KEY;
      delete process.env.CLAWQL_TIER;

      const exit = await Effect.runPromiseExit(createWormTrailConfigFromEnvEffect(process.env));
      expect(exit._tag).toBe("Failure");
      expect(String(exit)).toMatch(/Missing credentials.*CLAWQL_WORM_S3_SECRET_ACCESS_KEY/i);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
