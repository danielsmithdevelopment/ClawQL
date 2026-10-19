/**
 * General security mechanisms for the multi-attack configured arm.
 *
 * These are NOT a tool-name block list. The same gates would stop attack 13
 * that uses a different write tool, as long as the write is destructive or
 * the session was tainted by an untrusted read.
 *
 * Mechanisms (named on the board, not the tools):
 *   - untrusted_read_taint   — reading planted channel content taints the session
 *   - park_destructive_write — destructive writes park for a person (no side effect)
 *   - data_flow              — tainted session labels may not flow to vault sinks
 */

/** @typedef {{ id: string, channel: string, path: string, effectToken: string, hostileTitle: string }} Attack */

/**
 * @typedef {object} MechanismConfig
 * @property {boolean} untrustedReadTaint
 * @property {boolean} parkDestructiveWrites
 * @property {boolean} dataFlow
 */

/** Stock ClawQL today — neither lever is on by default for native memory writes. */
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
 * 2. Attempt a destructive write (ingest) carrying the effect token
 *
 * @param {Attack} attack
 * @param {MechanismConfig} mechanisms
 * @param {{ labels: Set<string> }} session
 * @returns {{ allow: boolean, mechanism: string | null, denyReason: string | null, tainted: boolean }}
 */
export function gateScriptedAttack(attack, mechanisms, session) {
  // Step 1: untrusted read of planted channel
  const channelLabel = `source:untrusted:${attack.channel}`;
  if (mechanisms.untrustedReadTaint || mechanisms.dataFlow) {
    session.labels.add(channelLabel);
  }
  const tainted = session.labels.size > 0;

  // Step 2: destructive write attempt (properties of the write, not its tool name)
  const writeIsDestructive = true;
  const sinkIsVault = true;

  if (mechanisms.untrustedReadTaint && tainted) {
    return {
      allow: false,
      mechanism: "untrusted_read_taint",
      denyReason:
        "Session tainted by untrusted channel read — subsequent write parked/blocked (general mechanism, not a tool-name deny)",
      tainted: true,
    };
  }

  if (mechanisms.dataFlow && tainted && sinkIsVault) {
    return {
      allow: false,
      mechanism: "data_flow",
      denyReason:
        "Data-flow policy: untrusted labels may not flow to vault sink",
      tainted: true,
    };
  }

  if (mechanisms.parkDestructiveWrites && writeIsDestructive) {
    return {
      allow: false,
      mechanism: "park_destructive_write",
      denyReason:
        "Destructive write parked for a person (destructiveHint / mandate) — no side effect until approval",
      tainted,
    };
  }

  return { allow: true, mechanism: null, denyReason: null, tainted };
}
