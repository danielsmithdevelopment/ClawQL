import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  runKillNodeStandinDemoEffect,
  writeKillNodeStandinEvidence,
} from "./kill-node-standin-demo.js";

describe("kill-node stand-in demo", () => {
  it("SIGKILL read-resume + write outcome_unknown arms pass", async () => {
    const evidence = await Effect.runPromise(
      runKillNodeStandinDemoEffect({
        CELLD_VERSION: "v0.3.0",
        CLAWQL_PROGRAM_CELLD_ISOLATE: "0",
      })
    );
    expect(evidence.kind).toBe("file-journal-sigkill-standin");
    expect(evidence.honesty).toMatch(/Tier A/i);
    expect(evidence.honesty).toMatch(/durability-proof\/STATUS/i);
    expect(evidence.arms).toHaveLength(2);
    for (const arm of evidence.arms) {
      expect(arm.ok, arm.detail).toBe(true);
    }
    expect(evidence.ok).toBe(true);
    expect(evidence.pin.isolateKillNodeEligible).toBe(false);
    expect(evidence.statePreserved).toMatchObject({ measured: true, preserved: true });
    expect(evidence.arms[0]?.statePreserved).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), "kill-standin-ev-"));
    const path = writeKillNodeStandinEvidence(evidence, join(dir, "evidence.json"));
    const loaded = JSON.parse(await readFile(path, "utf8"));
    expect(loaded.ok).toBe(true);
    expect(loaded.statePreserved.preserved).toBe(true);
  }, 60_000);
});
