import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildInferenceRecord } from "../store/types.js";
import {
  filterRecordsForExport,
  matchesExportFilter,
  recordHitsErasureDenyList,
} from "./filter.js";
import { formatExportLine } from "./format.js";
import { sha256Hex } from "./manifest.js";

function sampleRecord(overrides: Partial<ReturnType<typeof buildInferenceRecord>> = {}) {
  return {
    ...buildInferenceRecord({
      id: "r1",
      request: {
        messages: [{ role: "user" as const, content: "hi" }],
        model: "openai/gpt-4o",
        correlationId: "corr-1",
      },
      response: {
        content: "hello",
        model: "openai/gpt-4o",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 100,
    }),
    evaluatorVerdict: "passed" as const,
    evaluatorScore: 0.9,
    ...overrides,
  };
}

describe("export filter", () => {
  it("filters by verdict and score", () => {
    const passed = sampleRecord();
    const failed = sampleRecord({ evaluatorVerdict: "failed", evaluatorScore: 0.2 });
    expect(matchesExportFilter(passed, { verdict: "passed", minScore: 0.8 })).toBe(true);
    expect(matchesExportFilter(failed, { verdict: "passed", minScore: 0.8 })).toBe(false);
  });

  it("filters cache hits and token efficiency", () => {
    const cached = sampleRecord({ cacheHit: true });
    const slow = sampleRecord({ latencyMs: 9000 });
    expect(matchesExportFilter(cached, { excludeCacheHits: true })).toBe(false);
    expect(matchesExportFilter(slow, { maxLatencyMs: 5000 })).toBe(false);
    expect(matchesExportFilter(sampleRecord(), { minTokenEfficiency: 0.3 })).toBe(true);
    expect(matchesExportFilter(sampleRecord(), { minTokenEfficiency: 0.9 })).toBe(false);
  });

  it("excludes records whose content hash is on the erasure deny-list", () => {
    const erasedBody = "erased vault note body that must not reappear";
    const hash = createHash("sha256").update(erasedBody, "utf8").digest("hex");
    const denied = sampleRecord({
      messages: [{ role: "user", content: erasedBody }],
      response: "ok",
    });
    const allowed = sampleRecord({
      messages: [{ role: "user", content: "unrelated prompt" }],
      response: "ok",
    });
    const deny = new Set([hash]);
    expect(recordHitsErasureDenyList(denied, deny)).toBe(true);
    expect(recordHitsErasureDenyList(allowed, deny)).toBe(false);
    expect(matchesExportFilter(denied, {}, { erasedContentHashes: deny })).toBe(false);
    expect(matchesExportFilter(allowed, {}, { erasedContentHashes: deny })).toBe(true);
    const filtered = filterRecordsForExport([denied, allowed], {}, { erasedContentHashes: deny });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.messages[0]?.content).toBe("unrelated prompt");
  });
});

describe("export format", () => {
  it("emits openai-jsonl messages", () => {
    const line = formatExportLine(sampleRecord(), "openai-jsonl");
    const parsed = JSON.parse(line) as { messages: Array<{ role: string; content: string }> };
    expect(parsed.messages.at(-1)?.role).toBe("assistant");
    expect(parsed.messages.at(-1)?.content).toBe("hello");
  });

  it("hashes sample lines", () => {
    const line = formatExportLine(sampleRecord(), "raw-jsonl");
    expect(sha256Hex(line)).toMatch(/^[0-9a-f]{64}$/);
  });
});
