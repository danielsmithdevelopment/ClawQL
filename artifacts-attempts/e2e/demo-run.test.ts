/**
 * Acceptance runs.
 *
 * - ATTEMPTS_LOCAL=1 (default in CI without Cloudflare): real local-git witnesses
 *   (bare repos, git notes, vitest, dry-run Arweave). Not a stub of our own output.
 * - ATTEMPTS_E2E=1: live Cloudflare Artifacts + Arweave (requires credentials).
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyEvidenceChain } from "@artifacts-attempts/notes";
import { verifyBundleAgainstManifest } from "@artifacts-attempts/manifest";
import { runLocalDemo } from "@artifacts-attempts/pipeline";

const local = process.env.ATTEMPTS_LOCAL !== "0";
const live = process.env.ATTEMPTS_E2E === "1";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe.skipIf(!local)("demo-run (local-git witnesses)", () => {
  it(
    "seed → 3 attempts → notes chain → policy block → merge → dry-run release",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "aa-e2e-"));
      roots.push(root);
      const result = await runLocalDemo({ root, decisionsMode: "calibrated" });

      expect(result.notes).toHaveLength(3);
      expect(verifyEvidenceChain(result.notes)).toEqual({ ok: true });
      expect(result.attempts.find((a) => a.id === "att_3")?.status).toBe("blocked");
      expect(result.decision.winner).toBe("att_1");
      expect(result.mainCommit).toMatch(/^[0-9a-f]{40}$/);

      const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
      expect(
        verifyBundleAgainstManifest(manifest, [
          { path: "delivery.js", bytes: readFileSync(join(root, "artifacts/main-wt/src/delivery.js")) },
          { path: "package.json", bytes: readFileSync(join(root, "artifacts/main-wt/package.json")) },
        ])
      ).toEqual({ ok: true });
      expect(manifest.policy.canaryPercent).toBe(10);
      expect(manifest.policy.rollback.trigger).toContain("error_rate");
      const canary = JSON.parse(readFileSync(result.canaryStatusPath, "utf8"));
      expect(canary.mode).toBe("dry-run");
      expect(canary.versions.find((v: { label: string }) => v.label === "canary")?.percentage).toBe(
        10
      );
    },
    180_000
  );
});

describe.skipIf(!live)("demo-run (live Artifacts + Arweave)", () => {
  it("requires Cloudflare env, then probes Artifacts REST", async () => {
    const { missingLiveEnv } = await import("./live-env.js");
    const missing = missingLiveEnv();
    if (missing.length) {
      throw new Error(
        `ATTEMPTS_E2E=1 but missing: ${missing.join(", ")}. See .env.example and npm run demo:live-check`
      );
    }
    const { createRestClient } = await import("@artifacts-attempts/artifacts-client");
    const client = createRestClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: process.env.CLOUDFLARE_API_TOKEN!,
      namespace: process.env.ARTIFACTS_NAMESPACE?.trim() || "attempts",
    });
    const repos = await client.list();
    expect(Array.isArray(repos)).toBe(true);
  });
});
