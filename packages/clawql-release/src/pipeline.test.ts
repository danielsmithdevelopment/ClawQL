import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { writeReleaseConfig } from "./config.js";
import { createWorkspaceSnapshot, listWorkspaceSnapshots } from "./workspace/index.js";
import { publishRelease } from "./publish.js";
import { verifyReleaseTarget, verifyReleaseBundle } from "./verify.js";
import { pullRelease } from "./pull.js";
import { buildGoldenImages } from "./golden-image.js";
import { encryptBuffer, decryptBuffer } from "./crypto/encrypt.js";
import { payForReleaseAccess } from "./access/x402.js";
import { requestLitDecryptionKey, buildPaymentLitCondition } from "./crypto/lit.js";

function gitInit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "test"], { cwd: dir, encoding: "utf8" });
}

describe("clawql-release pipeline", () => {
  it("creates git-worktree and rift workspace snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-ws-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
    gitInit(root);
    await writeReleaseConfig(root, undefined, { skipSigningSetup: true });

    const wt = await createWorkspaceSnapshot({
      rootDir: root,
      backend: "git-worktree",
      name: "agent-a",
    });
    expect(wt.backend).toBe("git-worktree");
    expect(wt.snapshotId).toContain("git-worktree");

    const rift = await createWorkspaceSnapshot({
      rootDir: root,
      backend: "rift",
      name: "agent-b",
      parentSnapshotId: wt.snapshotId,
    });
    expect(rift.backend).toBe("rift");
    expect(rift.parentSnapshotId).toBe(wt.snapshotId);

    const listed = await listWorkspaceSnapshots(root);
    expect(listed.length).toBe(2);
  });

  it("publishes with IPFS staging + Arweave dry-run and verifies by tx id", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-perm-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.1.0" }), "utf8");
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, '{"bomFormat":"CycloneDX"}', "utf8");
    gitInit(root);
    await writeReleaseConfig(root, undefined, { skipSigningSetup: true });

    const published = await publishRelease({
      rootDir: root,
      tag: "v2.1.0",
      sbomPath,
      copyArtifacts: true,
      stageIpfs: true,
      permanent: true,
      dryRun: true,
      syncCollaboration: true,
    });

    expect(published.ipfsCid).toMatch(/^clawql-cid:sha256:/);
    expect(published.arweaveTxId).toMatch(/^local_/);
    expect(published.manifest.staging?.ipfs?.mode).toBe("local-content-addressed");
    expect(published.manifest.permanence?.arweave?.mode).toBe("local-dry-run");
    expect(published.manifest.collaboration?.primary).toBe("radicle");

    const byPath = await verifyReleaseBundle(published.bundleDir, root);
    expect(byPath.ok).toBe(true);
    expect(byPath.manifest.signatures.release?.algorithm).toBe("ed25519");

    const byTx = await verifyReleaseTarget(published.arweaveTxId!, { rootDir: root });
    expect(byTx.ok).toBe(true);
  });

  it("encrypts paid release, pays via x402 dry-run, decrypts through Lit", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-pay-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "3.0.0" }), "utf8");
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, "secret-sbom", "utf8");
    gitInit(root);
    await writeReleaseConfig(root, undefined, { skipSigningSetup: true });

    const published = await publishRelease({
      rootDir: root,
      tag: "v3.0.0",
      sbomPath,
      copyArtifacts: true,
      encrypt: true,
      permanent: true,
      stageIpfs: true,
      dryRun: true,
      price: "0.50 USDC",
    });

    expect(published.encrypted).toBe(true);
    expect(published.manifest.access?.paymentRequired).toBe(true);
    expect(published.manifest.access?.encryption?.algorithm).toBe("chacha20-poly1305");

    const pulled = await pullRelease({
      rootDir: root,
      target: published.arweaveTxId!,
      dryRun: true,
    });
    expect(pulled.ok).toBe(true);
    expect(pulled.decrypted).toBe(true);
  });

  it("round-trips ChaCha20-Poly1305 and Lit payment gate", async () => {
    const blob = encryptBuffer(Buffer.from("hello clawql"));
    const plain = decryptBuffer(blob);
    expect(plain.toString("utf8")).toBe("hello clawql");

    const payment = await payForReleaseAccess(
      { amount: "0.50 USDC", recipient: "0xabc", resource: "tx1" },
      { dryRun: true }
    );
    expect(payment.ok).toBe(true);

    const lit = await requestLitDecryptionKey(
      {
        condition: buildPaymentLitCondition(),
        proof: { receipt: payment.receipt },
        escrowKeyHex: blob.keyHex,
      },
      { dryRun: true }
    );
    expect(lit.ok).toBe(true);
    expect(lit.keyHex).toBe(blob.keyHex);
  });

  it("builds golden-image attestations", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-gold-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    gitInit(root);
    await writeReleaseConfig(root, undefined, { skipSigningSetup: true });
    const result = await buildGoldenImages({
      rootDir: root,
      version: "1.2.3",
      imageDigests: { "clawql-mcp": "sha256:" + "cd".repeat(32) },
      dryRun: true,
    });
    expect(result.signed).toBe(true);
    expect(result.images["clawql-mcp"]?.digest).toContain("sha256:");
    const raw = await readFile(result.attestationsPath, "utf8");
    expect(raw).toContain("ed25519");
  });
});
