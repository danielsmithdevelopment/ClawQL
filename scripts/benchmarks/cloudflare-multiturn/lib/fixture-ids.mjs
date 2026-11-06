/**
 * Stable fake IDs for sanitized Cloudflare fixtures.
 * Real → fake mapping must be consistent across a recording.
 */

export const FAKE = Object.freeze({
  accountId: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
  auditZoneId: "z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0",
  auditZoneName: "audit-target.example",
  targetIp: "203.0.113.50",
  workerScriptName: "edge-router",
  workerCompatDate: "2024-11-12",
  unproxiedRecordName: "origin.audit-target.example",
  unproxiedRecordId: "dns00000000000000000000000000001",
});

/** Deterministic hex-ish id from an integer seed. */
export function fakeId(prefix, n, width = 32) {
  const hex = n.toString(16).padStart(width, "0").slice(-width);
  if (prefix === "zone") return `z${hex.slice(1)}`;
  if (prefix === "dns") return `d${hex.slice(1)}`;
  if (prefix === "rule") return `r${hex.slice(1)}`;
  if (prefix === "route") return `t${hex.slice(1)}`;
  return hex;
}
