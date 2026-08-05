import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listWidgets, getWidgetById } from "../src/handler.js";
import { matchRoute } from "../src/router.js";

describe("widgets", () => {
  it("lists widgets", () => {
    const rows = listWidgets();
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
  });

  it("getWidgetById finds known ids", () => {
    const row = getWidgetById("w1");
    assert.equal(row?.name, "Alpha");
  });

  it("getWidgetById returns null when not found", () => {
    assert.equal(getWidgetById("missing"), null);
  });

  it("router matches /widgets/:id", () => {
    const hit = matchRoute("GET", "/widgets/w2");
    assert.ok(hit);
    assert.equal(hit.path, "/widgets/:id");
    assert.equal(hit.handlerName, "getWidgetById");
  });
});
