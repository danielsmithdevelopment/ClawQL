import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyEvidenceChain } from "@artifacts-attempts/notes";
import { verifyBundleAgainstManifest } from "@artifacts-attempts/manifest";
import { readFileSync } from "node:fs";
import { runLocalDemo } from "./local-demo.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe("local demo pipeline", () => {
  it(
    "runs three attempts, blocks policy, merges winner, dry-run release",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "aa-demo-"));
      roots.push(root);
      const result = await runLocalDemo({ root, decisionsMode: "calibrated" });

      expect(result.attempts).toHaveLength(3);
      expect(result.attempts.find((a) => a.id === "att_3")?.status).toBe("blocked");
      expect(result.attempts.find((a) => a.id === "att_1")?.status).toBe("won");
      expect(result.autoMerge).toBe(true);
      expect(result.trustReason).toBe("calibrated_confident");
      expect(result.approvalUsed).toBe(false);
      expect(verifyEvidenceChain(result.notes)).toEqual({ ok: true });

      const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
      expect(manifest.buildEnvironment.fork).toBe("tsk_demo-att_1");
      expect(manifest.policy.canaryPercent).toBe(10);
      expect(result.canaryPercent).toBe(10);
      expect(result.canary.mode).toBe("dry-run");
      expect(result.canary.versions.find((v) => v.label === "canary")?.percentage).toBe(10);
      expect(result.canary.rollbackTrigger).toContain("error_rate");

      const files = [
        {
          path: "delivery.js",
          bytes: readFileSync(join(root, "artifacts/main-wt/src/delivery.js")),
        },
        {
          path: "package.json",
          bytes: readFileSync(join(root, "artifacts/main-wt/package.json")),
        },
      ];
      expect(verifyBundleAgainstManifest(manifest, files)).toEqual({ ok: true });
      // release step attaches gradual-deploy body used by the Workers path
      const { prepareRelease } = await import("./release-step.js");
      const release = prepareRelease({
        version: "0.1.0-demo",
        files,
        taskId: result.task.id,
        attemptId: "att_1",
        fork: "tsk_demo-att_1",
        commit: result.mainCommit,
        canaryPercent: 10,
        dryRun: true,
      });
      expect(release.gradualDeploy.versions.map((v) => v.percentage)).toEqual([90, 10]);
    },
    180_000
  );

  it(
    "routes uncalibrated decisions through approval",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "aa-demo-oa-"));
      roots.push(root);
      const result = await runLocalDemo({
        root,
        decisionsMode: "openai",
        approveIfNeeded: true,
      });
      expect(result.autoMerge).toBe(false);
      expect(result.trustReason).toBe("uncalibrated");
      expect(result.approvalUsed).toBe(true);
      expect(result.task.status).toBe("released");
    },
    180_000
  );
});
