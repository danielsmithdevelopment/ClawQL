import { describe, expect, it } from "vitest";
import {
  executeOutputFields,
  projectRestByFields,
  topLevelProjectionKeys,
} from "./field-projection.js";

describe("execute field projection", () => {
  it("topLevelProjectionKeys parses GraphQL selection fragments", () => {
    expect(topLevelProjectionKeys(["nodes { id name }", "pageInfo { hasNextPage }"])).toEqual([
      "nodes",
      "pageInfo",
    ]);
  });

  it("topLevelProjectionKeys passes through plain field names", () => {
    expect(topLevelProjectionKeys(["id", "name", "email"])).toEqual(["id", "name", "email"]);
  });

  it("topLevelProjectionKeys deduplicates repeated top-level names", () => {
    expect(topLevelProjectionKeys(["nodes { id }", "nodes { name }"])).toEqual(["nodes"]);
  });

  it("projectRestByFields keeps only listed top-level keys", () => {
    expect(projectRestByFields({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("projectRestByFields projects connection-shaped GraphQL responses", () => {
    const data = {
      nodes: [
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
      extra: "stripped",
    };
    expect(
      projectRestByFields(data, ["nodes { id name }", "pageInfo { hasNextPage endCursor }"])
    ).toEqual({
      nodes: [
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it("projectRestByFields no longer returns empty object for nested field syntax", () => {
    const data = { nodes: [{ id: "x" }] };
    expect(projectRestByFields(data, ["nodes { id }"])).toEqual({ nodes: [{ id: "x" }] });
    expect(projectRestByFields(data, ["nodes { id }"])).not.toEqual({});
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
