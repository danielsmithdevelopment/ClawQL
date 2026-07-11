import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectLocalSyncFiles } from "./collect.js";
import { DEFAULT_SYNC_INCLUDE } from "./paths.js";
import {
  parseSyncProvider,
  resolveHomeSyncConfig,
  resolveSyncCredentials,
  resolveSyncEndpoint,
} from "./config.js";
import { syncProviderProfile } from "./providers.js";
import type { HomeSyncConfigFile, ResolvedHomeSyncConfig } from "./types.js";

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

describe("parseSyncProvider", () => {
  it("accepts r2, s3, gcs and common aliases", () => {
    expect(parseSyncProvider(undefined)).toBe("r2");
    expect(parseSyncProvider("r2")).toBe("r2");
    expect(parseSyncProvider("s3")).toBe("s3");
    expect(parseSyncProvider("aws")).toBe("s3");
    expect(parseSyncProvider("gcs")).toBe("gcs");
    expect(parseSyncProvider("gcp")).toBe("gcs");
    expect(parseSyncProvider("google")).toBe("gcs");
    expect(() => parseSyncProvider("azure")).toThrow(/r2, s3, or gcs/);
  });
});

describe("syncProviderProfile", () => {
  it("uses path-style for R2 and GCS interop", () => {
    expect(syncProviderProfile("r2").forcePathStyle).toBe(true);
    expect(syncProviderProfile("gcs").forcePathStyle).toBe(true);
    expect(syncProviderProfile("s3").forcePathStyle).toBe(false);
    expect(syncProviderProfile("gcs").defaultEndpoint).toBe("https://storage.googleapis.com");
  });
});

describe("resolveSyncCredentials", () => {
  const base = (provider: ResolvedHomeSyncConfig["provider"]): ResolvedHomeSyncConfig => ({
    version: 1,
    provider,
    bucket: "team-bucket",
    home: "/tmp/clawql",
    include: ["Memory"],
    manifestKey: "manifest.json",
  });

  it("resolves GCS HMAC env vars", () => {
    const prev = {
      id: process.env.CLAWQL_GCS_HMAC_ACCESS_ID,
      secret: process.env.CLAWQL_GCS_HMAC_SECRET,
    };
    process.env.CLAWQL_GCS_HMAC_ACCESS_ID = "gcs-access";
    process.env.CLAWQL_GCS_HMAC_SECRET = "gcs-secret";
    try {
      const creds = resolveSyncCredentials(base("gcs"));
      expect(creds.accessKeyId).toBe("gcs-access");
      expect(creds.secretAccessKey).toBe("gcs-secret");
    } finally {
      if (prev.id === undefined) delete process.env.CLAWQL_GCS_HMAC_ACCESS_ID;
      else process.env.CLAWQL_GCS_HMAC_ACCESS_ID = prev.id;
      if (prev.secret === undefined) delete process.env.CLAWQL_GCS_HMAC_SECRET;
      else process.env.CLAWQL_GCS_HMAC_SECRET = prev.secret;
    }
  });

  it("throws provider-specific error when GCS credentials missing", () => {
    const prev = {
      id: process.env.CLAWQL_GCS_HMAC_ACCESS_ID,
      secret: process.env.CLAWQL_GCS_HMAC_SECRET,
      syncId: process.env.CLAWQL_SYNC_ACCESS_KEY_ID,
      syncSecret: process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY,
    };
    delete process.env.CLAWQL_GCS_HMAC_ACCESS_ID;
    delete process.env.CLAWQL_GCS_HMAC_SECRET;
    delete process.env.GCS_HMAC_ACCESS_ID;
    delete process.env.GCS_HMAC_SECRET;
    delete process.env.CLAWQL_SYNC_ACCESS_KEY_ID;
    delete process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY;
    try {
      expect(() => resolveSyncCredentials(base("gcs"))).toThrow(/GCS sync credentials missing/);
    } finally {
      if (prev.id === undefined) delete process.env.CLAWQL_GCS_HMAC_ACCESS_ID;
      else process.env.CLAWQL_GCS_HMAC_ACCESS_ID = prev.id;
      if (prev.secret === undefined) delete process.env.CLAWQL_GCS_HMAC_SECRET;
      else process.env.CLAWQL_GCS_HMAC_SECRET = prev.secret;
      if (prev.syncId === undefined) delete process.env.CLAWQL_SYNC_ACCESS_KEY_ID;
      else process.env.CLAWQL_SYNC_ACCESS_KEY_ID = prev.syncId;
      if (prev.syncSecret === undefined) delete process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY;
      else process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY = prev.syncSecret;
    }
  });
});

describe("resolveSyncEndpoint", () => {
  it("defaults GCS to storage.googleapis.com", () => {
    const cfg: ResolvedHomeSyncConfig = {
      version: 1,
      provider: "gcs",
      bucket: "acme-clawql-team",
      home: "/tmp/clawql",
      include: ["Memory"],
      manifestKey: "manifest.json",
    };
    expect(resolveSyncEndpoint(cfg)).toBe("https://storage.googleapis.com");
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

describe("sync pull manifest verification", () => {
  it("assertManifestSha256 passes matching digest", async () => {
    const { assertManifestSha256, sha256HexBuffer } = await import("./verify.js");
    const body = Buffer.from("# note\n", "utf8");
    assertManifestSha256("Memory/note.md", body, sha256HexBuffer(body));
  });

  it("assertManifestSha256 throws on mismatch", async () => {
    const { assertManifestSha256 } = await import("./verify.js");
    expect(() =>
      assertManifestSha256("Memory/note.md", Buffer.from("tampered"), "a".repeat(64))
    ).toThrow(/Team sync verification failed/);
  });
});
