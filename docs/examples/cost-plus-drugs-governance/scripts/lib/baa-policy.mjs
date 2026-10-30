#!/usr/bin/env node
/**
 * Demo-only BAA / PHI routing policy.
 *
 * Production ClawQL does not yet ship a dedicated "BAA enum" — this file shows
 * the *policy shape* buyers need: patient-identifying fields may only flow to
 * model providers covered by a Business Associate Agreement. Public drug
 * prices are not PHI; mock patient fields are.
 */
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

/** Fields treated as patient-identifying in this mock (never send to non-BAA models). */
export const PHI_FIELD_NAMES = new Set([
  "patient_name",
  "patient_dob",
  "patient_email",
  "patient_phone",
  "shipping_address",
  "member_id",
  "rx_number",
]);

/**
 * @typedef {{
 *   providers: Record<string, { baa: boolean, notes?: string }>,
 *   defaultDenyWithoutBaa: boolean,
 * }} BaaPolicy
 */

/**
 * @param {string} path
 * @returns {Promise<BaaPolicy>}
 */
export async function loadBaaPolicy(path) {
  const text = await readFile(path, "utf8");
  const doc = parseYaml(text);
  if (!doc || typeof doc !== "object") {
    throw new Error(`invalid BAA policy: ${path}`);
  }
  const providers = doc.providers && typeof doc.providers === "object" ? doc.providers : {};
  return {
    providers,
    defaultDenyWithoutBaa: doc.defaultDenyWithoutBaa !== false,
  };
}

/**
 * @param {BaaPolicy} policy
 * @param {string} providerId
 */
export function providerHasBaa(policy, providerId) {
  const entry = policy.providers[providerId];
  return Boolean(entry?.baa);
}

/**
 * Redact PHI fields unless the model provider is covered by a BAA.
 * Public pricing fields pass through unchanged.
 *
 * @param {BaaPolicy} policy
 * @param {string} providerId
 * @param {Record<string, unknown>} payload
 */
export function gatePayloadForProvider(policy, providerId, payload) {
  const allowed = providerHasBaa(policy, providerId);
  if (allowed) {
    return {
      allowed: true,
      providerId,
      baa: true,
      payload: { ...payload },
      redactedFields: [],
    };
  }
  if (!policy.defaultDenyWithoutBaa) {
    return {
      allowed: true,
      providerId,
      baa: false,
      payload: { ...payload },
      redactedFields: [],
      warning: "defaultDenyWithoutBaa=false — PHI may leak",
    };
  }
  /** @type {Record<string, unknown>} */
  const scrubbed = {};
  const redactedFields = [];
  for (const [k, v] of Object.entries(payload)) {
    if (PHI_FIELD_NAMES.has(k)) {
      scrubbed[k] = "[REDACTED_NO_BAA]";
      redactedFields.push(k);
    } else {
      scrubbed[k] = v;
    }
  }
  return {
    allowed: redactedFields.length === 0 || true,
    providerId,
    baa: false,
    payload: scrubbed,
    redactedFields,
    reason:
      redactedFields.length > 0
        ? `Provider ${providerId} has no BAA; PHI fields redacted before model context`
        : `Provider ${providerId} has no BAA; payload had no PHI fields`,
  };
}
