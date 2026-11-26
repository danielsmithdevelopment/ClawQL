import { describe, expect, it, vi } from "vitest";
import { genericClientError, newCorrelationId } from "./generic-client-error.js";

describe("genericClientError (2.16)", () => {
  it("returns a correlation id and does not echo the raw error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = genericClientError(
      "test",
      new SyntaxError('Unexpected token "Bearer secret-token"'),
      "request failed"
    );
    expect(body.ok).toBe(false);
    expect(body.error).toBe("request failed");
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(JSON.stringify(body)).not.toContain("secret-token");
    expect(newCorrelationId()).not.toBe(body.correlationId);
    spy.mockRestore();
  });
});
