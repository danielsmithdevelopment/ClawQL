import { describe, expect, it } from "vitest";
import {
  buildCodeChangeIngestProposal,
  codeChangeVaultFlywheelEnabled,
} from "./codegraph-code-change.js";

describe("codegraph-code-change flywheel", () => {
  it("returns null for empty impact", () => {
    expect(
      buildCodeChangeIngestProposal({
        seedQuery: "x",
        depth: 2,
        impacted: [],
        files: [],
      })
    ).toBeNull();
  });

  it("builds type:code_change proposal from impact hits", () => {
    const p = buildCodeChangeIngestProposal({
      seedQuery: "parseConfig",
      seedNodeId: "n1",
      depth: 2,
      impacted: [
        {
          nodeId: "n2",
          name: "loadConfig",
          kind: "function",
          filePath: "src/config.ts",
          distance: 1,
        },
      ],
      files: ["src/config.ts", "src/cli.ts"],
    });
    expect(p).not.toBeNull();
    expect(p!.type).toBe("code_change");
    expect(p!.title).toContain("parseConfig");
    expect(p!.insights).toContain("loadConfig");
    expect(p!.tags).toContain("codegraph");
  });

  it("flywheel enabled by default", () => {
    const saved = process.env.CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST;
    delete process.env.CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST;
    try {
      expect(codeChangeVaultFlywheelEnabled()).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST;
      else process.env.CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST = saved;
    }
  });
});
