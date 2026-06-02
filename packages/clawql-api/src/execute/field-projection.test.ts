import { describe, expect, it } from "vitest";
import { executeOutputFields, projectRestByFields } from "./field-projection.js";

describe("execute field projection", () => {
  it("projectRestByFields keeps only listed top-level keys", () => {
    expect(projectRestByFields({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("executeOutputFields uses GitHub pull defaults when fields omitted", () => {
    expect(executeOutputFields("pulls/create", undefined)).toEqual([
      "html_url",
      "number",
      "title",
      "state",
      "url",
    ]);
  });
});
