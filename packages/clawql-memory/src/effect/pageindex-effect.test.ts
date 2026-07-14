import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { executePageindexBuildTreeEffect } from "./pageindex-effect.js";

describe("executePageindexBuildTreeEffect", () => {
  it("builds a tree via Effect staging", async () => {
    const result = await Effect.runPromise(
      executePageindexBuildTreeEffect({
        docId: "doc-effect-1",
        markdown: "# Hello\n\nWorld",
        storagePath: "/tmp/clawql-pageindex-effect-test.db.json",
      })
    );
    const body = JSON.parse(result.content[0]!.text) as {
      docId?: string;
      nodeCount?: number;
      ok?: boolean;
      error?: string;
    };
    expect(body.docId).toBe("doc-effect-1");
    expect(body.nodeCount).toBeGreaterThan(0);
  });
});
