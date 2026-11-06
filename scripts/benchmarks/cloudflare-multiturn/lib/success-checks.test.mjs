import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExpectations, checkStep } from "./success-checks.mjs";
import { FAKE } from "./fixture-ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../fixtures/recording.synthetic.json"), "utf8")
);

describe("zone-audit success checks", () => {
  const exp = buildExpectations(fixture.world);

  it("accepts correct step observations", () => {
    assert.equal(checkStep(1, { zoneId: FAKE.auditZoneId }, exp).ok, true);
    assert.equal(checkStep(3, { ssl: "full" }, exp).ok, true);
    assert.equal(checkStep(12, { proposal: { recordId: FAKE.unproxiedRecordId, proxied: true } }, exp).ok, true);
  });

  it("rejects wrong zone id", () => {
    assert.equal(checkStep(1, { zoneId: "deadbeef" }, exp).ok, false);
  });

  it("counts A records and unproxied names from fixture", () => {
    const dns = fixture.world.dnsRecords;
    const aCount = dns.filter((r) => r.type === "A").length;
    assert.equal(checkStep(4, { aRecordCount: aCount }, exp).ok, true);
    const unproxied = dns
      .filter((r) => r.type === "A" && r.content === FAKE.targetIp && r.proxied === false)
      .map((r) => r.name);
    assert.equal(checkStep(6, { unproxiedNames: unproxied }, exp).ok, true);
  });
});
