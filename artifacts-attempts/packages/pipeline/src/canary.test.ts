import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCanaryStatus,
  buildGradualDeployRequest,
  gradualDeployUrl,
  writeCanaryStatus,
} from "./canary.js";

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
    expect(assertCanaryStatus(status)).toEqual({ ok: true });
    expect(assertCanaryStatus(status, { expectPercent: 25 }).ok).toBe(false);
  });

  it("builds Workers gradual deploy request body totaling 100%", () => {
    const body = buildGradualDeployRequest({
      canaryPercent: 10,
      versionId: "ver_new",
      previousVersionId: "ver_old",
    });
    expect(body.strategy).toBe("percentage");
    expect(body.versions.reduce((s, v) => s + v.percentage, 0)).toBe(100);
    expect(body.versions).toEqual([
      { version_id: "ver_old", percentage: 90 },
      { version_id: "ver_new", percentage: 10 },
    ]);
    expect(gradualDeployUrl("acct", "script")).toContain(
      "/accounts/acct/workers/scripts/script/deployments"
    );
  });
});
