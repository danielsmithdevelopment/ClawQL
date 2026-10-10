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
      expect(result.approvalUsed).toBe(false);
      expect(verifyEvidenceChain(result.notes)).toEqual({ ok: true });

      const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
      expect(manifest.buildEnvironment.fork).toBe("tsk_demo-att_1");
      expect(manifest.policy.canaryPercent).toBe(10);
      expect(result.canaryPercent).toBe(10);

      const files = [
        {
          path: "delivery.js",
          bytes: readFileSync(join(root, "main-wt/src/delivery.js")),
        },
        {
          path: "package.json",
          bytes: readFileSync(join(root, "main-wt/package.json")),
        },
      ];
      expect(verifyBundleAgainstManifest(manifest, files)).toEqual({ ok: true });
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
      expect(result.approvalUsed).toBe(true);
      expect(result.task.status).toBe("released");
    },
    180_000
  );
});
