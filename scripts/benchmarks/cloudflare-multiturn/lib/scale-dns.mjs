/**
 * Scale a sparse DNS list to N records using the real record schema / field distributions.
 * Board must label "real schemas, scaled content" when this is applied.
 */
import { fakeId, FAKE } from "./fixture-ids.mjs";

/**
 * @param {object[]} records existing DNS records from a recording
 * @param {number} targetCount
 */
export function scaleDnsRecords(records, targetCount) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("scaleDnsRecords requires at least one real record as template");
  }
  if (records.length >= targetCount) return records.slice();

  const types = {};
  for (const r of records) types[r.type] = (types[r.type] || 0) + 1;
  const typeKeys = Object.keys(types);
  const zoneId = records[0].zone_id || FAKE.auditZoneId;
  const zoneName = records[0].zone_name || FAKE.auditZoneName;
  const out = records.slice();
  let n = out.length;
  while (out.length < targetCount) {
    n += 1;
    const template = records[n % records.length];
    const type = typeKeys[n % typeKeys.length];
    out.push({
      ...template,
      id: fakeId("dns", n + 10000),
      zone_id: zoneId,
      zone_name: zoneName,
      name: `scaled-${n}.${zoneName}`,
      type,
      content:
        type === "A"
          ? `198.51.100.${(n % 250) + 1}`
          : type === "CNAME"
            ? `scaled-${n}.cdn.example`
            : `scaled-txt-${n}`,
      proxied: type === "A" ? n % 4 !== 0 : false,
      comment: "scaled",
    });
  }
  return out;
}
