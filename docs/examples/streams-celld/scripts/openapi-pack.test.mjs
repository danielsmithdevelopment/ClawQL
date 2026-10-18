#!/usr/bin/env node
/**
 * Lab 5b OpenAPI pack unit checks (no celld / MCP required).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packPath = join(root, "openapi", "streams-lab5b.openapi.json");
const pack = JSON.parse(readFileSync(packPath, "utf8"));

assert.equal(pack.openapi.startsWith("3."), true);
assert.equal(pack.paths["/pets"]?.get?.operationId, "listPets");
assert.equal(
  pack.paths["/streams/session/noop"]?.get?.operationId,
  "streams.session.noop"
);

const opIds = Object.values(pack.paths).flatMap((pathItem) =>
  Object.values(pathItem)
    .filter((op) => op && typeof op === "object" && op.operationId)
    .map((op) => op.operationId)
);
assert.ok(opIds.includes("listPets"));
assert.ok(opIds.includes("streams.session.noop"));

console.log("openapi-pack.test: PASS", packPath);
