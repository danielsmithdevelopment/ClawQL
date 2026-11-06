/**
 * Strip account IDs, zone IDs, emails, and tokens from Cloudflare recordings.
 * Same real ID always maps to the same fake ID within one sanitize pass.
 */

import { FAKE, fakeId } from "./fixture-ids.mjs";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_RE = /\b(Bearer\s+)?[A-Za-z0-9_-]{40,}\b/g;
const CF_ID_RE = /\b[a-f0-9]{32}\b/gi;

/**
 * @param {unknown} value
 * @param {{ idMap?: Map<string, string>, preferZone?: string }} [opts]
 */
export function sanitizeValue(value, opts = {}) {
  const idMap = opts.idMap ?? new Map();
  let zoneCounter = 0;
  let otherCounter = 0;

  function mapId(id, kind = "other") {
    const key = id.toLowerCase();
    if (idMap.has(key)) return idMap.get(key);
    let fake;
    if (kind === "account" || key.length === 32 && opts.accountId && key === opts.accountId.toLowerCase()) {
      fake = FAKE.accountId;
    } else if (kind === "zone") {
      zoneCounter += 1;
      fake = zoneCounter === 1 ? FAKE.auditZoneId : fakeId("zone", zoneCounter);
    } else {
      otherCounter += 1;
      fake = fakeId("x", otherCounter + 1000);
    }
    idMap.set(key, fake);
    return fake;
  }

  function walk(v) {
    if (v == null) return v;
    if (typeof v === "string") {
      let s = v.replace(EMAIL_RE, "user@example.invalid");
      s = s.replace(TOKEN_RE, (m) => (m.startsWith("Bearer") ? "Bearer REDACTED_TOKEN" : "REDACTED_TOKEN"));
      s = s.replace(CF_ID_RE, (id) => mapId(id, "other"));
      return s;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === "account_id" && typeof val === "string") out[k] = mapId(val, "account");
        else if ((k === "zone_id" || k === "id") && typeof val === "string" && /^[a-f0-9]{32}$/i.test(val)) {
          out[k] = mapId(val, k === "zone_id" ? "zone" : "other");
        } else out[k] = walk(val);
      }
      return out;
    }
    return v;
  }

  return { value: walk(value), idMap };
}

/**
 * Sanitize a full recording document (array of call records).
 * @param {{ calls: object[] }} recording
 */
export function sanitizeRecording(recording) {
  const idMap = new Map();
  const calls = (recording.calls || []).map((call) => {
    const { value: body } = sanitizeValue(call.body, { idMap });
    const { value: headers } = sanitizeValue(call.headers || {}, { idMap });
    const { value: query } = sanitizeValue(call.query || {}, { idMap });
    return {
      ...call,
      url: typeof call.url === "string" ? call.url.replace(CF_ID_RE, (id) => {
        const key = id.toLowerCase();
        if (!idMap.has(key)) idMap.set(key, fakeId("x", idMap.size + 1));
        return idMap.get(key);
      }) : call.url,
      headers,
      query,
      body,
      // never persist auth
      authorization: undefined,
    };
  });
  return {
    ...recording,
    sanitized: true,
    sanitizedAt: new Date().toISOString(),
    idMapSize: idMap.size,
    calls,
  };
}
