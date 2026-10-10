import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeCanaryStatus } from "./canary.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe("writeCanaryStatus", () => {
  it("writes percentage split and rollback trigger", () => {
    const root = mkdtempSync(join(tmpdir(), "aa-canary-"));
    roots.push(root);
    const path = join(root, "status.json");
    const status = writeCanaryStatus(path, {
      canaryPercent: 10,
      versionId: "ver_abc",
      previousVersionId: "ver_prev",
      rollbackTrigger: "error_rate > 1%",
    });

    expect(status.mode).toBe("dry-run");
    expect(status.versions).toEqual([
      { versionId: "ver_prev", percentage: 90, label: "previous" },
      { versionId: "ver_abc", percentage: 10, label: "canary" },
    ]);
    expect(status.rollbackTrigger).toBe("error_rate > 1%");
    expect(JSON.parse(readFileSync(path, "utf8")).versions[1].percentage).toBe(10);
  });
});
