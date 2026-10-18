#!/usr/bin/env node
/**
 * Unit checks for slim Core catalog (no celld required).
 */
import assert from "node:assert/strict";
import {
  CORE_IN_CELLD_HONESTY,
  resolveSlimExecute,
  searchSlimCatalog,
} from "../src/core-catalog.js";

const pets = searchSlimCatalog("listPets pets", 5);
assert.equal(pets.ok, true);
assert.equal(pets.transport, "celld-isolate");
assert.equal(pets.results[0]?.operationId, "listPets");
assert.match(pets.honesty, /CoreToolsDO/);

const noop = searchSlimCatalog("streams session noop", 5);
assert.ok(noop.results.some((r) => r.operationId === "streams.session.noop"));

const plan = resolveSlimExecute("listPets", {});
assert.equal(plan.ok, true);
assert.equal(plan.op.path, "/pets");

const missing = resolveSlimExecute("no.such.op", {});
assert.equal(missing.ok, false);

assert.match(CORE_IN_CELLD_HONESTY, /celld isolate/);
console.log("core-catalog.test: PASS");
