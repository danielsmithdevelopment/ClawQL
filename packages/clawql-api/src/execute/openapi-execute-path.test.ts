import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  openApiExecutePathModeEffect,
  preferRestOpenApiExecuteEffect,
  selectionNeedsInProcessGraphQLEffect,
} from "./openapi-execute-path.js";

describe("openapi execute path", () => {
  it("defaults to auto", async () => {
    const mode = await Effect.runPromise(openApiExecutePathModeEffect({}));
    expect(mode).toBe("auto");
  });

  it("reads CLAWQL_OPENAPI_EXECUTE_PATH", async () => {
    expect(
      await Effect.runPromise(openApiExecutePathModeEffect({ CLAWQL_OPENAPI_EXECUTE_PATH: "rest" }))
    ).toBe("rest");
    expect(
      await Effect.runPromise(
        openApiExecutePathModeEffect({ CLAWQL_OPENAPI_EXECUTE_PATH: "graphql" })
      )
    ).toBe("graphql");
  });

  it("detects nested GraphQL selection sets", async () => {
    expect(
      await Effect.runPromise(
        selectionNeedsInProcessGraphQLEffect("listPets", ["pets { id name }"])
      )
    ).toBe(true);
    expect(
      await Effect.runPromise(selectionNeedsInProcessGraphQLEffect("listPets", ["pets", "count"]))
    ).toBe(false);
  });

  it("auto prefers REST for plain fields and GraphQL for nested", async () => {
    const env = { CLAWQL_OPENAPI_EXECUTE_PATH: "auto" };
    expect(await Effect.runPromise(preferRestOpenApiExecuteEffect("listPets", ["pets"], env))).toBe(
      true
    );
    expect(
      await Effect.runPromise(preferRestOpenApiExecuteEffect("listPets", ["pets { id }"], env))
    ).toBe(false);
  });

  it("graphql mode never prefers REST; rest mode always does", async () => {
    expect(
      await Effect.runPromise(
        preferRestOpenApiExecuteEffect("listPets", ["pets { id }"], {
          CLAWQL_OPENAPI_EXECUTE_PATH: "rest",
        })
      )
    ).toBe(true);
    expect(
      await Effect.runPromise(
        preferRestOpenApiExecuteEffect("listPets", ["pets"], {
          CLAWQL_OPENAPI_EXECUTE_PATH: "graphql",
        })
      )
    ).toBe(false);
  });

  it("auto uses GraphQL when defaultFields has nested selection", async () => {
    expect(
      await Effect.runPromise(
        preferRestOpenApiExecuteEffect("run.googleapis.com.services.list", undefined, {
          CLAWQL_OPENAPI_EXECUTE_PATH: "auto",
        })
      )
    ).toBe(false);
  });
});
