import { describe, expect, it } from "vitest";
import { normalizeOperationId, sanitizeOperationSegment } from "./spec-kind.js";

describe("sanitizeOperationSegment", () => {
  it("keeps alphanumerics", () => {
    expect(sanitizeOperationSegment("loans_select")).toBe("loans_select");
    expect(sanitizeOperationSegment("IssueLoan")).toBe("IssueLoan");
  });

  it("replaces non-alphanumeric with single underscore", () => {
    expect(sanitizeOperationSegment("repos/list-commits")).toBe("repos_list_commits");
    expect(sanitizeOperationSegment("a::b")).toBe("a_b");
  });

  it("trims edge underscores from segment", () => {
    expect(sanitizeOperationSegment("__x__")).toBe("x");
  });

  it("maps empty input to underscore placeholder", () => {
    expect(sanitizeOperationSegment("")).toBe("_");
    expect(sanitizeOperationSegment("___")).toBe("_");
  });
});

describe("normalizeOperationId", () => {
  it("joins kind, provider, operation with double underscore", () => {
    expect(normalizeOperationId("postgres", "public", "loans_select")).toBe(
      "postgres__public__loans_select"
    );
  });

  it("sanitizes each segment", () => {
    expect(normalizeOperationId("grpc", "my.service/v1", "Foo/Bar")).toBe(
      "grpc__my_service_v1__Foo_Bar"
    );
  });

  it("accepts string kind for forward compatibility", () => {
    expect(normalizeOperationId("future-kind", "p", "op")).toBe("future_kind__p__op");
  });
});
