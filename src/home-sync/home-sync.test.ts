import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectLocalSyncFiles } from "./collect.js";
import { DEFAULT_SYNC_INCLUDE } from "./paths.js";
import { resolveHomeSyncConfig } from "./config.js";
import type { HomeSyncConfigFile } from "./types.js";

describe("collectLocalSyncFiles", () => {
  let home: string;

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("includes Memory markdown and excludes provider secrets", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-sync-"));
    await mkdir(join(home, "Memory"), { recursive: true });
    await mkdir(join(home, "vault"), { recursive: true });
    await writeFile(join(home, "Memory", "note.md"), "# Team note\n", "utf8");
    await writeFile(join(home, "vault", "providers.json"), '{"githubToken":"x"}\n', "utf8");
    await writeFile(join(home, "sources.json"), '{"version":1,"sources":[]}\n', "utf8");

    const files = await collectLocalSyncFiles(home, [...DEFAULT_SYNC_INCLUDE]);
    expect(files.has("Memory/note.md")).toBe(true);
    expect(files.has("sources.json")).toBe(true);
    expect(files.has("vault/providers.json")).toBe(false);
    expect(files.get("Memory/note.md")?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("resolveHomeSyncConfig", () => {
  it("defaults provider to r2 and merges env bucket", () => {
    const prev = process.env.CLAWQL_SYNC_BUCKET;
    process.env.CLAWQL_SYNC_BUCKET = "team-bucket";
    try {
      const file: HomeSyncConfigFile = {
        version: 1,
        provider: "r2",
        bucket: "ignored",
        prefix: "teams/acme/",
      };
      const cfg = resolveHomeSyncConfig(file, "/tmp/clawql");
      expect(cfg.provider).toBe("r2");
      expect(cfg.bucket).toBe("team-bucket");
      expect(cfg.prefix).toBe("teams/acme/");
      expect(cfg.include).toContain("Memory");
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_SYNC_BUCKET;
      else process.env.CLAWQL_SYNC_BUCKET = prev;
    }
  });
});
