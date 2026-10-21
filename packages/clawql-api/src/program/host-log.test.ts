import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { hostLogOperationIds, parseHostLogLines } from "./host-log.js";

describe("host-log", () => {
  it("parses JSON lines and legacy bare ids", async () => {
    const raw = [
      JSON.stringify({ operationId: "pets.get", effectId: "pets.get", applied: true }),
      "owners.list",
      JSON.stringify({
        operationId: "owners.create",
        effectId: "idem:k",
        applied: false,
      }),
    ].join("\n");
    const lines = await Effect.runPromise(parseHostLogLines(raw));
    expect(lines.map((l) => l.operationId)).toEqual(["pets.get", "owners.list", "owners.create"]);
    expect(lines[2]?.applied).toBe(false);
    expect(await Effect.runPromise(hostLogOperationIds(raw))).toEqual([
      "pets.get",
      "owners.list",
      "owners.create",
    ]);
  });
});
