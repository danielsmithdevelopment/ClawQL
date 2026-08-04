import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportRecords } from "./run-export.js";
import { writePortalRefit } from "./portal-bundle.js";
import { matchesExportFilter } from "./filter.js";
import type { InferenceRecord } from "../store/types.js";

function sampleRecord(overrides: Partial<InferenceRecord> = {}): InferenceRecord {
  return {
    id: "1",
    correlationId: "sess-1",
    timestamp: "2026-08-01T00:00:00.000Z",
    modelId: "openai/gpt-4o-mini",
    provider: "openai",
    messages: [{ role: "user", content: "hi" }],
    response: "hello",
    latencyMs: 10,
    evaluatorVerdict: "passed",
    ...overrides,
  };
}

describe("portal-bundle + OKF filters", () => {
  it("filters by OKF trust lookup", () => {
    const ok = matchesExportFilter(
      sampleRecord(),
      { okfVerified: "human", okfStatus: "current" },
      new Map([["sess-1", { path: "Memory/a.cqk", status: "current", verifiedBy: "human" }]])
    );
    expect(ok).toBe(true);
    const no = matchesExportFilter(
      sampleRecord(),
      { okfVerified: "human" },
      new Map([["sess-1", { path: "Memory/a.cqk", status: "current", verifiedBy: "agent" }]])
    );
    expect(no).toBe(false);
  });

  it("writes portal-bundle directory and refits alignment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-portal-"));
    const out = join(dir, "bundle");
    const result = await exportRecords({
      records: [sampleRecord()],
      output: out,
      format: "portal-bundle",
      filter: { verdict: "passed" },
      noPiiScrub: true,
      baseModel: "qwen/qwen3.6-27b",
      vaultRef: "abc123",
    });
    expect(result.rowCount).toBe(1);
    const manifest = JSON.parse(await readFile(join(out, "adapter_manifest.cqm"), "utf8")) as {
      kind: string;
      merkleRoot: string;
    };
    expect(manifest.kind).toBe("portal-bundle");
    expect(manifest.merkleRoot).toMatch(/^[a-f0-9]+$/i);
    await readFile(join(out, "task_latent.pt"));
    await readFile(join(out, "training.jsonl"), "utf8");

    const refitDir = join(dir, "refit");
    const refit = await writePortalRefit({
      bundlePath: out,
      targetModel: "qwen/qwen3.7-27b",
      outputDir: refitDir,
    });
    expect(refit.alignmentLora).toContain("qwen3.7");
    await readFile(join(refitDir, "adapter_manifest.cqm"), "utf8");
  });
});
