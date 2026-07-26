import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SYNC_BUCKET,
  DEFAULT_SYNC_PREFIX,
  defaultEnsureBucketName,
  defaultEnsurePrefix,
  ensureR2BucketViaCloudflareApi,
  ensureSyncBucket,
} from "./ensure-bucket.js";

describe("defaultEnsureBucketName / prefix", () => {
  afterEach(() => {
    delete process.env.CLAWQL_SYNC_BUCKET;
    delete process.env.CLAWQL_SYNC_PREFIX;
  });

  it("defaults to clawql-team-vault and teams/shared/", () => {
    expect(defaultEnsureBucketName("r2")).toBe(DEFAULT_SYNC_BUCKET);
    expect(defaultEnsurePrefix()).toBe(DEFAULT_SYNC_PREFIX);
  });

  it("honors CLAWQL_SYNC_BUCKET env", () => {
    process.env.CLAWQL_SYNC_BUCKET = "Acme_ClawQL_Team";
    expect(defaultEnsureBucketName("r2")).toBe("acme-clawql-team");
  });
});

describe("ensureR2BucketViaCloudflareApi", () => {
  it("returns already-exists when GET is ok", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await ensureR2BucketViaCloudflareApi({
      accountId: "acct",
      token: "tok",
      bucket: "clawql-team-vault",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual({ created: false, method: "already-exists" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("creates via POST when GET is 404", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return new Response("missing", { status: 404 });
      }
      expect(url).toContain("/r2/buckets");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.name).toBe("clawql-team-vault");
      expect(body.locationHint).toBe("weur");
      return new Response("{}", { status: 200 });
    });
    const result = await ensureR2BucketViaCloudflareApi({
      accountId: "acct",
      token: "tok",
      bucket: "clawql-team-vault",
      locationHint: "weur",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual({ created: true, method: "cloudflare-api" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("dry-run skips POST", async () => {
    const fetchFn = vi.fn(async () => new Response("missing", { status: 404 }));
    const result = await ensureR2BucketViaCloudflareApi({
      accountId: "acct",
      token: "tok",
      bucket: "clawql-team-vault",
      dryRun: true,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual({ created: true, method: "cloudflare-api" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe("ensureSyncBucket", () => {
  let home: string;
  const prevEnv: Record<string, string | undefined> = {};

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stubEnv(map: Record<string, string>) {
    for (const [k, v] of Object.entries(map)) {
      if (!(k in prevEnv)) prevEnv[k] = process.env[k];
      process.env[k] = v;
    }
  }

  it("creates R2 bucket via Cloudflare API and writes sync.json", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ensure-"));
    stubEnv({
      CLAWQL_HOME: home,
      CLAWQL_R2_ACCOUNT_ID: "acct123",
      CLOUDFLARE_API_TOKEN: "cf-tok",
    });
    delete process.env.CLAWQL_SYNC_ACCESS_KEY_ID;
    delete process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return new Response("no", { status: 404 });
      return new Response("{}", { status: 200 });
    });

    const result = await ensureSyncBucket({
      home,
      provider: "r2",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result.created).toBe(true);
    expect(result.method).toBe("cloudflare-api");
    expect(result.bucket).toBe(DEFAULT_SYNC_BUCKET);
    expect(result.prefix).toBe(DEFAULT_SYNC_PREFIX);

    const raw = await readFile(join(home, "sync.json"), "utf8");
    const cfg = JSON.parse(raw) as { bucket: string; provider: string; prefix: string; version: number };
    expect(cfg).toMatchObject({
      version: 1,
      provider: "r2",
      bucket: DEFAULT_SYNC_BUCKET,
      prefix: DEFAULT_SYNC_PREFIX,
    });
  });

  it("uses S3 CreateBucket when HeadBucket is not found", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ensure-s3-"));
    stubEnv({
      CLAWQL_HOME: home,
      CLAWQL_AWS_ACCESS_KEY_ID: "AKIA",
      CLAWQL_AWS_SECRET_ACCESS_KEY: "secret",
      CLAWQL_AWS_REGION: "us-east-1",
    });

    const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
      const name = cmd.constructor.name;
      if (name === "HeadBucketCommand") {
        const err = new Error("Not Found") as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        err.name = "NotFound";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (name === "CreateBucketCommand") return {};
      throw new Error(`unexpected ${name}`);
    });

    const result = await ensureSyncBucket({
      home,
      provider: "s3",
      bucket: "my-team-vault",
      prefix: "teams/eng/",
      createS3Client: () => ({ send }),
    });

    expect(result.created).toBe(true);
    expect(result.method).toBe("s3-api");
    expect(result.bucket).toBe("my-team-vault");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects gcs with a clear error", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ensure-gcs-"));
    await expect(ensureSyncBucket({ home, provider: "gcs" })).rejects.toThrow(
      /GCS bucket auto-create/
    );
  });
});
