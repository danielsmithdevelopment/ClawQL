import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  bindProcessSearchAtrTokens,
  getProcessSearchAtrTokens,
  resolveSearchAtrTokens,
} from "./process-search-atr.js";

describe("process search ATR", () => {
  const prev = process.env.CLAWQL_SESSION_ATR;

  beforeEach(() => {
    bindProcessSearchAtrTokens(undefined);
    delete process.env.CLAWQL_SESSION_ATR;
  });

  afterEach(() => {
    bindProcessSearchAtrTokens(undefined);
    if (prev === undefined) delete process.env.CLAWQL_SESSION_ATR;
    else process.env.CLAWQL_SESSION_ATR = prev;
  });

  it("explicit null disables filtering resolution", () => {
    bindProcessSearchAtrTokens(["github"]);
    expect(resolveSearchAtrTokens(null)).toBeUndefined();
  });

  it("explicit array wins over bind", () => {
    bindProcessSearchAtrTokens(["github"]);
    expect(resolveSearchAtrTokens(["slack"])).toEqual(["slack"]);
  });

  it("falls back to process bind then env", () => {
    expect(resolveSearchAtrTokens()).toBeUndefined();
    bindProcessSearchAtrTokens(["a", "b"]);
    expect(getProcessSearchAtrTokens()).toEqual(["a", "b"]);
    expect(resolveSearchAtrTokens()).toEqual(["a", "b"]);
    bindProcessSearchAtrTokens(undefined);
    process.env.CLAWQL_SESSION_ATR = "x, y";
    expect(resolveSearchAtrTokens()).toEqual(["x", "y"]);
  });
});
