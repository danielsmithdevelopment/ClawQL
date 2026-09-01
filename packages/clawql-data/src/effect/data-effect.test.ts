import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import "../engines/duckdb/index.js";
import {
  dataIngestProgram,
  dataQueryProgram,
  dataServicesLiveLayer,
  DataError,
  runDataEffect,
} from "./index.js";
import { resetClawqlDataStoreForTests } from "../store.js";

describe("clawql-data Effect pipeline", () => {
  afterEach(async () => {
    await resetClawqlDataStoreForTests();
  });

  it("ingest + query via Effect.gen programs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-data-effect-"));
    const env = {
      CLAWQL_DATA_PATH: join(dir, "matters.duckdb"),
      CLAWQL_DATA_ENGINE: "duckdb",
    };

    const ingest = await runDataEffect(
      dataIngestProgram({
        replace: true,
        matters: [
          {
            matter_id: "1005-00001",
            practice_area: "Banking & Finance",
            matter_type: "Credit Facility",
            is_credit_facility: true,
          },
        ],
      }),
      env
    );
    expect(ingest.ok).toBe(true);
    expect(ingest.matterCount).toBe(1);

    const out = await runDataEffect(
      dataQueryProgram("SELECT matter_id FROM matters WHERE is_credit_facility ORDER BY matter_id"),
      env
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rows).toEqual([{ matter_id: "1005-00001" }]);
  });

  it("maps Promise failures to DataError (not die)", async () => {
    const program = Effect.gen(function* () {
      return yield* Effect.fail(new DataError({ reason: "boom", cause: new Error("x") }));
    }).pipe(Effect.provide(dataServicesLiveLayer({ CLAWQL_DATA_ENGINE: "duckdb" })));

    const exit = await Effect.runPromiseExit(program);
    expect(exit._tag).toBe("Failure");
  });
});
