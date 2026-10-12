import { describe, expect, it } from "vitest";
import { buildReleaseManifest, merkleRootForBundle, verifyBundleAgainstManifest } from "./index.js";

describe("release merkle", () => {
  it("is stable under path order and detects tampering", () => {
    const files = [
      { path: "b.txt", bytes: Buffer.from("beta") },
      { path: "a.txt", bytes: Buffer.from("alpha") },
    ];
    const root = merkleRootForBundle(files);
    expect(merkleRootForBundle([...files].reverse())).toBe(root);

    const manifest = buildReleaseManifest({
      version: "0.1.0",
      files,
      canaryPercent: 10,
      buildEnvironment: {
        type: "artifacts-fork",
        fork: "tsk_7f2a-att_1",
        commit: "a".repeat(40),
        taskId: "tsk_7f2a",
        attemptId: "att_1",
        createdAt: "2026-10-11T15:00:00.000Z",
      },
    });

    expect(verifyBundleAgainstManifest(manifest, files)).toEqual({ ok: true });
    expect(
      verifyBundleAgainstManifest(manifest, [
        { path: "a.txt", bytes: Buffer.from("ALPHA") },
        { path: "b.txt", bytes: Buffer.from("beta") },
      ]).ok
    ).toBe(false);
  });
});
