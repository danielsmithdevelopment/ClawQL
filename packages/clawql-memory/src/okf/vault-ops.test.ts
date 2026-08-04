import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintVaultOkf, migrateVaultToOkfV02, queryVaultOkf } from "./vault-ops.js";

describe("OKF vault-ops", () => {
  it("migrates legacy notes to okf 0.2 and lints/query them", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-okf-"));
    const mem = join(root, "Memory");
    await mkdir(mem, { recursive: true });
    await writeFile(
      join(mem, "legacy.md"),
      `---
title: Legacy note
---

# Legacy note

body
`,
      "utf8"
    );
    await writeFile(
      join(mem, "decision.cqk"),
      `---
type: decision
title: Auth JWT
okf_version: "0.2"
status: current
correlation_id: sess-1
verified:
  by: human
  method: pr-review
worm_ref: sha256:abc
---

# Auth JWT
`,
      "utf8"
    );

    const migrated = await migrateVaultToOkfV02({ vault: root });
    expect(migrated.migrated).toBeGreaterThanOrEqual(1);
    const legacy = await readFile(join(mem, "legacy.md"), "utf8");
    expect(legacy).toMatch(/okf_version/);
    expect(legacy).toMatch(/status:\s*"?current"?/);

    const lint = await lintVaultOkf({ vault: root, checkStale: true });
    expect(lint.scanned).toBeGreaterThanOrEqual(2);
    expect(lint.ok).toBe(true);

    const q = await queryVaultOkf({
      vault: root,
      filter: "verified.by == human AND type == decision",
    });
    expect(q.count).toBe(1);
    expect(q.rows[0]?.path).toContain("decision.cqk");
  });
});
