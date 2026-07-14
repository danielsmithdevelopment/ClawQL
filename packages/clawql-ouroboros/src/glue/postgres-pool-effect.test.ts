import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ouroborosPgPoolScopedEffect } from "./postgres-pool-effect.js";

describe("ouroborosPgPoolScopedEffect", () => {
  it("acquires null and releases when Ouroboros DB env is unset", async () => {
    delete process.env.CLAWQL_OUROBOROS_DATABASE_URL;
    delete process.env.CLAWQL_OUROBOROS_DB_HOST;
    const pool = await Effect.runPromise(Effect.scoped(ouroborosPgPoolScopedEffect()));
    expect(pool).toBeNull();
  });
});
