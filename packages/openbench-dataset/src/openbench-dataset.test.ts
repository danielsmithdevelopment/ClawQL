import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsBackend } from "./backends/types.js";
import { scrubTextLocal } from "./scrub/local.js";
import { TraceWriter } from "./writer/trace-writer.js";

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
});
