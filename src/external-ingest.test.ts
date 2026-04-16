import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runIngestExternalKnowledge } from "./external-ingest.js";

describe("external-ingest", () => {
  const saved = process.env.CLAWQL_EXTERNAL_INGEST;

  beforeEach(() => {
    delete process.env.CLAWQL_EXTERNAL_INGEST;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
    else process.env.CLAWQL_EXTERNAL_INGEST = saved;
  });

  it("returns disabled stub when feature flag unset", async () => {
    const r = await runIngestExternalKnowledge({ source: "notion" });
    expect(r.stub).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/CLAWQL_EXTERNAL_INGEST/);
  });

  it("returns roadmap stub when CLAWQL_EXTERNAL_INGEST=1", async () => {
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    const r = await runIngestExternalKnowledge({ source: "github", dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.enabled).toBe(true);
    expect(r.roadmap.length).toBeGreaterThan(0);
    expect(r.relatedIssues).toContain(40);
  });
});
