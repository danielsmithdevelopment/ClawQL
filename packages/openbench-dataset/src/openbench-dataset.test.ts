import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsBackend } from "./backends/types.js";
import { scrubTextLocal } from "./scrub/local.js";
import { TraceWriter } from "./writer/trace-writer.js";
import { collectFromResults } from "./collect/from-results.js";
import { syncDatasetPack } from "./sync/sync-pack.js";
import {
  CloudflareR2RestBackend,
  DEFAULT_OPENBENCH_TRACES_BUCKET,
  encodeR2ObjectKey,
  ensureR2BucketViaCloudflareApi,
  resolveOpenBenchTracesBucket,
} from "./backends/cloudflare-r2.js";
import { resolveDurableBackendFromEnv } from "./backends/s3.js";

describe("openbench-dataset", () => {
  it("scrubs api keys locally", () => {
    const fields = new Set<string>();
    const out = scrubTextLocal("key sk-abcdefghijklmnopqrstuvwxyz012345", fields);
    expect(out).toContain("[REDACTED_API_KEY]");
    expect(fields.has("openai_key")).toBe(true);
  });

  it("writes a scrubbed RTP-compatible trace + manifest to local backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "ob-ds-"));
    const backend = new LocalFsBackend(root);
    const writer = new TraceWriter(backend, {
      dayPrefix: "2026/08/04",
      runId: "1",
      taskId: "demo-task",
    });
    const trace = await writer.writeTrace({
      runId: "1",
      taskId: "demo-task",
      armLabel: "clawql-on",
      arm: "on",
      trial: 1,
      model: "openrouter/deepseek/deepseek-chat",
      harness: "opencode",
      clawqlVersion: "deadbeef",
      messages: [{ role: "user", content: "hello sk-abcdefghijklmnopqrstuvwxyz012345" }],
      toolCalls: [{ tool: "clawql_memory_recall", input: { query: "pricing" } }],
      score: 1,
      suitableForTraining: true,
      manifestId: "ob-manifest-1-demo-task",
    });
    expect(trace.verdict).toBe("pass");
    expect(trace.schema_version).toBe("1.1");
    expect(String(trace.messages[0]?.content)).toContain("[REDACTED_API_KEY]");
    expect(trace.rtp?.protocol).toBe("rtp");
    expect(trace.rtp?.turnSequence[0]?.kind).toBe("intent");
    expect(trace.rtp?.turnSequence.at(-1)?.kind).toBe("verdict");
    expect(trace.rtp?.turnSequence.some((t) => t.kind === "retrieval")).toBe(true);
    expect(trace.rtp?.turnSequence.some((t) => t.kind === "execution")).toBe(true);
    expect(trace.rtp?.turnSequence.some((t) => t.kind === "delta")).toBe(true);
    expect(trace.rtp?.consentToken.scopes).toEqual(
      expect.arrayContaining(["community_model", "dataset_licensing"])
    );
    expect(trace.rtp?.verdict.evaluatorTier).toBe(1);
    // Turn chain: first prev null, subsequent link
    expect(trace.rtp?.turnSequence[0]?.prevTurnHash).toBeNull();
    expect(trace.rtp?.turnSequence[1]?.prevTurnHash).toBe(trace.rtp?.turnSequence[0]?.turnHash);
    const manifest = await writer.writeManifest();
    expect(manifest.traces).toHaveLength(1);
    expect(manifest.schema_version).toBe("1.1");
    const raw = await readFile(
      join(root, "raw/2026/08/04/run-1/demo-task/demo-task-on-001.jsonl"),
      "utf8"
    );
    expect(raw).toContain('"schema_version":"1.1"');
    expect(raw).toContain('"protocol":"rtp"');
  });

  it("projects messages/tools into a chained RTP session", async () => {
    const { projectToRtpSession, verifyOpenBenchConsentToken } = await import("./rtp/index.js");
    const session = projectToRtpSession({
      runId: "42",
      taskId: "policy-deny-execute",
      messages: [{ role: "user", content: "Deny the execute call" }],
      toolCalls: [
        { tool: "clawql_search", input: { query: "execute policy" } },
        { tool: "clawql_execute", input: { dry_run: true } },
      ],
      verdict: "pass",
      score: 1,
      graderId: "openbench/policy-deny-execute/checker.sh",
      env: { CLAWQL_RTP_CONSENT_SECRET: "test-secret", GITHUB_RUN_ID: "42" },
    });
    expect(session.turnSequence.map((t) => t.kind)).toEqual([
      "intent",
      "retrieval",
      "execution",
      "delta",
      "reasoning",
      "execution",
      "delta",
      "verdict",
    ]);
    expect(session.verdict.evaluatorTier).toBe(1);
    expect(verifyOpenBenchConsentToken(session.consentToken.token, {
      CLAWQL_RTP_CONSENT_SECRET: "test-secret",
      GITHUB_RUN_ID: "42",
    })).toBe(true);
  });

  it("collects from results.json and syncs to a local backend", async () => {
    const artifact = await mkdtemp(join(tmpdir(), "ob-art-"));
    await writeFile(
      join(artifact, "results.json"),
      JSON.stringify({
        schema: "clawql.openbench.ab.v1",
        task: "demo-task",
        model: "openrouter/deepseek/deepseek-chat",
        harness: "opencode",
        trials_detail: [
          {
            trial: 1,
            arm: "clawql-on",
            agent: { completed: true, turns: 2, wall_s: 1.5, timed_out: false },
            checker: { score: 1, success: true },
          },
          {
            trial: 1,
            arm: "clawql-off",
            agent: { completed: true, turns: 1, wall_s: 0.5, timed_out: false },
            checker: { score: 0, success: false },
          },
        ],
      }),
      "utf8"
    );
    await mkdir(join(artifact, "call-store"), { recursive: true });
    await writeFile(
      join(artifact, "call-store", "calls.jsonl"),
      `${JSON.stringify({
        id: "c1",
        correlationId: "openbench/clawql-on/1/99",
        messages: [{ role: "user", content: "hi" }],
        response: "ok",
      })}\n`,
      "utf8"
    );

    const collected = await collectFromResults({
      artifactDir: artifact,
      runId: "99",
      taskId: "demo-task",
      clawqlVersion: "abc",
    });
    expect(collected.traceCount).toBe(2);
    expect(collected.suitableCount).toBe(1);

    const onLine = await readFile(
      join(collected.datasetDir, "traces", "demo-task-on-001.jsonl"),
      "utf8"
    );
    const onTrace = JSON.parse(onLine) as {
      schema_version: string;
      rtp: { protocol: string; turnSequence: unknown[] };
    };
    expect(onTrace.schema_version).toBe("1.1");
    expect(onTrace.rtp.protocol).toBe("rtp");
    expect(onTrace.rtp.turnSequence.length).toBeGreaterThanOrEqual(2);

    const sinkRoot = await mkdtemp(join(tmpdir(), "ob-sink-"));
    const sink = new LocalFsBackend(sinkRoot);
    const synced = await syncDatasetPack({
      datasetDir: collected.datasetDir,
      runId: "99",
      taskId: "demo-task",
      requireDurable: true,
      backend: sink,
      dayPrefix: "2026/08/04",
    });
    expect(synced.traceFiles).toBe(2);
    const uploaded = await readFile(
      join(sinkRoot, "raw/2026/08/04/run-99/demo-task/demo-task-on-001.jsonl"),
      "utf8"
    );
    expect(uploaded).toContain("demo-task");
    expect(uploaded).toContain('"protocol":"rtp"');
  });

  it("defaults traces bucket away from team sync vault", () => {
    expect(resolveOpenBenchTracesBucket({})).toBe(DEFAULT_OPENBENCH_TRACES_BUCKET);
    expect(
      resolveOpenBenchTracesBucket({ CLAWQL_SYNC_BUCKET: "clawql-team-vault" })
    ).toBe(DEFAULT_OPENBENCH_TRACES_BUCKET);
    expect(
      resolveOpenBenchTracesBucket({ CLAWQL_R2_TRACES_BUCKET: "my-traces" })
    ).toBe("my-traces");
  });

  it("encodes object keys with literal slashes", () => {
    expect(encodeR2ObjectKey("raw/2026/08/04/run-1/a.jsonl")).toBe(
      "raw/2026/08/04/run-1/a.jsonl"
    );
    expect(encodeR2ObjectKey("path/with space.jsonl")).toBe("path/with%20space.jsonl");
  });

  it("ensures bucket + puts via Cloudflare API token alone", async () => {
    const calls: { method: string; url: string }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (method === "GET" && url.includes("/r2/buckets/")) {
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      }
      if (method === "POST" && url.endsWith("/r2/buckets")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (method === "PUT" && url.includes("/objects/")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    };

    const ensured = await ensureR2BucketViaCloudflareApi({
      accountId: "acct123",
      token: "cf-tok",
      bucket: "clawql-openbench-traces",
      fetchFn,
    });
    expect(ensured.created).toBe(true);
    expect(ensured.method).toBe("cloudflare-api");

    const backend = new CloudflareR2RestBackend({
      accountId: "acct123",
      apiToken: "cf-tok",
      bucket: "clawql-openbench-traces",
      fetchFn,
    });
    await backend.putObject("raw/a/b.jsonl", '{"ok":true}', "application/x-ndjson");
    expect(calls.some((c) => c.method === "PUT" && c.url.includes("/objects/raw/a/b.jsonl"))).toBe(
      true
    );

    const resolved = await resolveDurableBackendFromEnv({
      env: {
        CLOUDFLARE_API_TOKEN: "cf-tok",
        CLOUDFLARE_ACCOUNT_ID: "acct123",
      },
      fetchFn,
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.transport).toBe("cloudflare-api");
      expect(resolved.bucket).toBe(DEFAULT_OPENBENCH_TRACES_BUCKET);
      expect(resolved.ensure?.created).toBe(true);
    }
  });
});
