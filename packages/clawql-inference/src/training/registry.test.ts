import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listDomainAdapters,
  loadDomainAdapterMap,
  promoteDomainAdapter,
  rollbackDomainAdapter,
} from "./registry.js";

describe("domain adapter registry", () => {
  it("promotes and rolls back adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-train-reg-"));
    const env = { CLAWQL_HOME: dir };
    try {
      await promoteDomainAdapter({
        domain: "legal",
        version: "v1",
        adapter: {
          path: "r2://clawql-models/adapters/legal-v1",
          baseModel: "qwen3.6-27b",
          evalResults: { harveyLabCriterionPassRate: 0.5 },
        },
        env,
      });
      await promoteDomainAdapter({
        domain: "legal",
        version: "v2",
        adapter: {
          path: "r2://clawql-models/adapters/legal-v2",
          baseModel: "qwen3.6-27b",
          evalResults: { harveyLabCriterionPassRate: 0.7 },
        },
        env,
      });
      const map = await loadDomainAdapterMap(env);
      expect(map.frugal?.adapters?.legal?.path).toContain("legal-v2");
      expect(map.frugal?.adapters?.legal?.previousPath).toContain("legal-v1");

      const rolled = await rollbackDomainAdapter("legal", { env });
      expect(rolled.rolledBack).toBe(true);
      expect(rolled.map.frugal?.adapters?.legal?.path).toContain("legal-v1");

      const listed = listDomainAdapters(rolled.map, "legal");
      expect(listed.legal?.path).toContain("legal-v1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
