import { describe, expect, it } from "vitest";
import { __testUtils } from "./tools.js";
import type { Operation } from "./spec-loader.js";

const op = {
  id: "run.projects.locations.services.get",
  method: "GET",
  description: "Get service",
  path: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  flatPath: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  resource: "services",
  parameters: {
    projectsId: { type: "string", location: "path", required: true, description: "" },
    locationsId: { type: "string", location: "path", required: true, description: "" },
    servicesId: { type: "string", location: "path", required: true, description: "" },
    pageSize: { type: "integer", location: "query", required: false, description: "" },
  },
} as Operation;

describe("tools helpers", () => {
  it("captures path params from templated path", () => {
    const out = __testUtils.capturePathParams(
      op.flatPath,
      "v2/projects/p1/locations/us-central1/services/svc-a"
    );
    expect(out).toEqual({
      projectsId: "p1",
      locationsId: "us-central1",
      servicesId: "svc-a",
    });
  });

  it("normalizes args by expanding parent/name and filtering unexpected args", () => {
    const out = __testUtils.normalizeArgsForField(
      op,
      {
        parent: "projects/p1/locations/us-central1",
        name: "v2/projects/p2/locations/eu/services/svc-b",
        pageSize: 10,
        unexpected: true,
      },
      ["projectsId", "locationsId", "servicesId", "pageSize"]
    );

    expect(out).toEqual({
      projectsId: "p1",
      locationsId: "us-central1",
      servicesId: "svc-b",
      pageSize: 10,
    });
  });

  it("maps discovery types to GraphQL scalars and required marker", () => {
    expect(__testUtils.discoveryTypeToGraphQL("integer", true)).toBe("Int!");
    expect(__testUtils.discoveryTypeToGraphQL("boolean")).toBe("Boolean");
    expect(__testUtils.discoveryTypeToGraphQL("unknown")).toBe("String");
  });

  it("returns IAM-focused default fields when operation mentions policy", () => {
    expect(__testUtils.defaultFields("run.projects.locations.services.setIamPolicy")).toContain(
      "bindings"
    );
  });

  it("projectRestByFields leaves data unchanged when fields omitted", () => {
    const row = { a: 1, b: { c: 2 } };
    expect(__testUtils.projectRestByFields(row, undefined)).toBe(row);
    expect(__testUtils.projectRestByFields(row, [])).toBe(row);
  });

  it("projectRestByFields keeps only listed top-level keys", () => {
    expect(
      __testUtils.projectRestByFields(
        { html_url: "u", number: 43, user: { login: "x" }, extra: 1 },
        ["html_url", "number"]
      )
    ).toEqual({ html_url: "u", number: 43 });
  });

  it("projectRestByFields maps over arrays", () => {
    expect(
      __testUtils.projectRestByFields(
        [
          { sha: "a", commit: {} },
          { sha: "b", tree: {} },
        ],
        ["sha"]
      )
    ).toEqual([{ sha: "a" }, { sha: "b" }]);
  });
});
