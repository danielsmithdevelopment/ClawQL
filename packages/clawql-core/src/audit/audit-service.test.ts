import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { AuditService, AuditTestLayer } from "./audit-service.js";
import { getClawqlAuditMaxEntries } from "./config.js";
import { resetDefaultAuditRingBufferForTests } from "./ring-buffer.js";

const run = <A, E>(program: Effect.Effect<A, E, AuditService>) =>
  Effect.runPromise(program.pipe(Effect.provide(AuditTestLayer)));

describe("AuditService (Effect)", () => {
  afterEach(() => {
    resetDefaultAuditRingBufferForTests();
  });

  it("append and list via Effect Layer", async () => {
    const list = await run(
      Effect.gen(function* () {
        const audit = yield* AuditService;
        yield* audit.append({
          category: "tool",
          action: "execute",
          summary: "petstore",
          correlationId: "c1",
        });
        return yield* audit.list(10);
      })
    );
    expect(list.total).toBe(1);
    expect(list.entries[0]?.category).toBe("tool");
    expect(list.entries[0]?.correlationId).toBe("c1");
  });

  it("clear via Effect Layer", async () => {
    await run(
      Effect.gen(function* () {
        const audit = yield* AuditService;
        yield* audit.append({ category: "x", action: "y", summary: "z" });
        const cleared = yield* audit.clear();
        expect(cleared.cleared).toBe(1);
        const list = yield* audit.list(10);
        expect(list.total).toBe(0);
      })
    );
  });

  it("getClawqlAuditMaxEntries respects env", () => {
    const saved = process.env.CLAWQL_AUDIT_MAX_ENTRIES;
    process.env.CLAWQL_AUDIT_MAX_ENTRIES = "42";
    expect(getClawqlAuditMaxEntries()).toBe(42);
    if (saved === undefined) delete process.env.CLAWQL_AUDIT_MAX_ENTRIES;
    else process.env.CLAWQL_AUDIT_MAX_ENTRIES = saved;
  });
});
