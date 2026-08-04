import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsBackend } from "./backends/types.js";
import { scrubTextLocal } from "./scrub/local.js";
import { TraceWriter } from "./writer/trace-writer.js";
import { collectFromResults } from "./collect/from-results.js";
import { syncDatasetPack } from "./sync/sync-pack.js";

describe("openbench-dataset", () => {
  it("scrubs api keys locally", () => {
    const fields = new Set<string>();
    const out = scrubTextLocal("key sk-abcdefghijklmnopqrstuvwxyz012345", fields);
    expect(out).toContain("[REDACTED_API_KEY]");
    expect(fields.has("openai_key")).toBe(true);
  });

  it("writes a scrubbed trace + manifest to local backend", async () => {
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
      toolCalls: [{ tool: "clawql_memory_recall" }],
      score: 1,
      suitableForTraining: true,
      manifestId: "ob-manifest-1-demo-task",
    });
    expect(trace.verdict).toBe("pass");
    expect(String(trace.messages[0]?.content)).toContain("[REDACTED_API_KEY]");
    const manifest = await writer.writeManifest();
    expect(manifest.traces).toHaveLength(1);
    const raw = await readFile(
      join(root, "raw/2026/08/04/run-1/demo-task/demo-task-on-001.jsonl"),
      "utf8"
    );
    expect(raw).toContain("schema_version");
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
  });
});
