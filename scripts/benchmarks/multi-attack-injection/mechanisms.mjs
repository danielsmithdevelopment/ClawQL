/**
 * General security mechanisms for the multi-attack configured arm.
 *
 * These are NOT a tool-name block list. The same gates would stop attack 13
 * that uses a different write tool, as long as the write is destructive or
 * the session was tainted by an untrusted read flowing to a blocking sink.
 *
 * Mechanisms (named on the board, not the tools):
 *   - untrusted_read_taint   — reading planted channel content taints the session
 *   - park_destructive_write — overwrites / destructive writes park for a person
 *   - data_flow              — tainted labels may not flow to external/privileged sinks;
 *                              vault (labelable) sinks accept writes with untrusted labels
 */

/** @typedef {{ id: string, channel: string, path: string, effectToken: string, hostileTitle: string }} Attack */

/**
 * @typedef {object} MechanismConfig
 * @property {boolean} untrustedReadTaint
 * @property {boolean} parkDestructiveWrites
 * @property {boolean} dataFlow
 */

/** Stock ClawQL with mechanisms off (passthrough control). */
export const MECHANISMS_OFF = Object.freeze({
  untrustedReadTaint: false,
  parkDestructiveWrites: false,
  dataFlow: false,
});

/**
 * Best-configuration for ClawQL: general mechanisms, not BLOCK_TOOLS=memory_ingest.
 * Intentionally does not mention any tool name in the deny decision.
 */
export const MECHANISMS_CONFIGURED = Object.freeze({
  untrustedReadTaint: true,
  parkDestructiveWrites: true,
  dataFlow: true,
});

export const MECHANISM_NAMES = Object.freeze([
  "untrusted_read_taint",
  "park_destructive_write",
  "data_flow",
]);

/**
 * Scripted agent flow for one planted attack:
 * 1. Read planted channel content (untrusted) → may taint session
 * 2. Attempt a write (ingest). Overwrites park; labeled vault appends may proceed.
 *
 * @param {Attack} attack
 * @param {MechanismConfig} mechanisms
 * @param {{ labels: Set<string> }} session
 * @param {{ overwrite?: boolean, sink?: 'vault'|'external' }} [writeOpts]
 * @returns {{ allow: boolean, mechanism: string | null, denyReason: string | null, tainted: boolean, labeled?: boolean }}
 */
export function gateScriptedAttack(attack, mechanisms, session, writeOpts = {}) {
  const channelLabel = `source:untrusted:${attack.channel}`;
  if (mechanisms.untrustedReadTaint || mechanisms.dataFlow) {
    session.labels.add(channelLabel);
    session.labels.add("source:untrusted");
  }
  const tainted = session.labels.size > 0;
  const overwrite = writeOpts.overwrite === true;
  const sink = writeOpts.sink ?? "vault";

  // Park destructive overwrites first (OVERRIDE of authoritative facts).
  if (mechanisms.parkDestructiveWrites && overwrite) {
    return {
      allow: false,
      mechanism: "park_destructive_write",
      denyReason:
        "Overwrite of existing facts parked for a person — no side effect until approval",
      tainted,
    };
  }

  // External / privileged sinks: untrusted may not flow.
  if (mechanisms.dataFlow && tainted && sink === "external") {
    return {
      allow: false,
      mechanism: tainted
        ? "untrusted_read_taint"
        : "data_flow",
      denyReason:
        "Data-flow policy: untrusted labels may not flow to an external or privileged sink",
      tainted: true,
    };
  }

  // Vault (labelable): allow with untrusted provenance — not a successful trusted attack.
  if (mechanisms.dataFlow && tainted && sink === "vault") {
    return {
      allow: true,
      mechanism: null,
      denyReason: null,
      tainted: true,
      labeled: true,
    };
  }

  if (mechanisms.untrustedReadTaint && tainted && sink === "external") {
    return {
      allow: false,
      mechanism: "untrusted_read_taint",
      denyReason:
        "Session tainted by untrusted channel read — external write blocked",
      tainted: true,
    };
  }

  return { allow: true, mechanism: null, denyReason: null, tainted, labeled: false };
}
