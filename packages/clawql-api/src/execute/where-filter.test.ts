import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { hashPendingArgs } from "../pending/args-hash.js";
import {
  applyWhereEffect,
  shapeExecuteDataEffect,
  validateWhereCapsEffect,
  WHERE_MAX_LENGTH,
  WHERE_MAX_PIPES,
  WhereFilterError,
  WhereFilterLive,
  WhereFilterService,
} from "./where-filter.js";

const sample = [
  { number: 1, title: "Bug A", state: "open", labels: [{ name: "bug" }] },
  { number: 2, title: "Feat B", state: "closed", labels: [{ name: "enhancement" }] },
  { number: 3, title: "Bug C", state: "open", labels: [{ name: "bug" }] },
];

describe("where filter (JMESPath)", () => {
  it("filters array rows then projects fields", async () => {
    const shaped = await Effect.runPromise(
      shapeExecuteDataEffect(sample, {
        where: "[?state=='open']",
        fields: ["number", "title"],
      })
    );
    expect(shaped).toEqual([
      { number: 1, title: "Bug A" },
      { number: 3, title: "Bug C" },
    ]);
  });

  it("extracts from a single object", async () => {
    const shaped = await Effect.runPromise(
      applyWhereEffect({ user: { login: "alice", id: 9 } }, "user.login")
    );
    expect(shaped).toBe("alice");
  });

  it("fails closed on invalid JMESPath with a fix hint", async () => {
    const failed = await Effect.runPromise(
      applyWhereEffect(sample, "[?").pipe(
        Effect.match({
          onFailure: (e) => e,
          onSuccess: () => null,
        })
      )
    );
    expect(failed).toBeInstanceOf(WhereFilterError);
    expect((failed as WhereFilterError).issue).toBe("invalid_expression");
    expect((failed as WhereFilterError).fixHint).toMatch(/JMESPath/);
    expect((failed as WhereFilterError)._tag).toBe("WhereFilterError");
  });

  it("rejects over-long expressions (size cap)", async () => {
    const tooLong = "a".repeat(WHERE_MAX_LENGTH + 1);
    const failed = await Effect.runPromise(
      validateWhereCapsEffect(tooLong).pipe(
        Effect.match({
          onFailure: (e) => e,
          onSuccess: () => null,
        })
      )
    );
    expect(failed).toBeInstanceOf(WhereFilterError);
    expect((failed as WhereFilterError).issue).toBe("too_long");
    expect((failed as WhereFilterError).fixHint).toMatch(/512/);
  });

  it("rejects over-complex pipe chains", async () => {
    const pipes = Array.from({ length: WHERE_MAX_PIPES + 1 }, () => "@").join(" | ");
    const failed = await Effect.runPromise(
      validateWhereCapsEffect(pipes).pipe(
        Effect.match({
          onFailure: (e) => e,
          onSuccess: () => null,
        })
      )
    );
    expect(failed).toBeInstanceOf(WhereFilterError);
    expect((failed as WhereFilterError).issue).toBe("too_complex");
    expect((failed as WhereFilterError).fixHint).toMatch(/pipes/i);
  });

  it("omitted where is identity", async () => {
    const out = await Effect.runPromise(applyWhereEffect(sample, undefined));
    expect(out).toBe(sample);
  });

  it("WhereFilterService layer applies where", async () => {
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* WhereFilterService;
        return yield* svc.apply(sample, "[?number==`2`]");
      }).pipe(Effect.provide(WhereFilterLive))
    );
    expect(out).toEqual([{ number: 2, title: "Feat B", state: "closed", labels: [{ name: "enhancement" }] }]);
  });

  it("binds where into pending args hash when set", () => {
    const base = hashPendingArgs({
      operationId: "pulls/list",
      args: { state: "all" },
      fields: ["number"],
    });
    const withWhere = hashPendingArgs({
      operationId: "pulls/list",
      args: { state: "all" },
      fields: ["number"],
      where: "[?state=='open']",
    });
    expect(withWhere).not.toBe(base);
    expect(
      hashPendingArgs({
        operationId: "pulls/list",
        args: { state: "all" },
        fields: ["number"],
        where: "[?state=='open']",
      })
    ).toBe(withWhere);
  });
});
