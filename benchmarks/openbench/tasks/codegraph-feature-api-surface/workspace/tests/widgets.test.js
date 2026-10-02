import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listWidgets } from "../src/handler.js";

describe("widgets", () => {
  it("lists widgets", () => {
    const rows = listWidgets();
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
  });

  // TODO: add getWidgetById found + not-found tests once the API surface is wired
});
