/**
 * ATR visibility for skill index rows (spec §6.4 / §7.3).
 * Standalone skills are not gated by tool ATR; provider-bundled skills inherit it.
 */

import type { AtrScope, SkillIndexEntry } from "./provider-types.js";

/**
 * Whether a skill index entry may appear in `search` / `skills_list` under session ATR.
 *
 * - `atrScope === undefined` — host has no ATR context; do not filter (dev / ungated).
 * - Standalone skills — always visible (applicability still applies at ranking).
 * - Provider skills — visible iff ATR is non-empty and matches plugin id / tool tokens.
 */
export function isSkillVisibleUnderAtr(
  entry: SkillIndexEntry,
  atrScope: AtrScope | undefined
): boolean {
  if (atrScope === undefined) return true;
  if (entry.source !== "provider") return true;
  if (atrScope.size === 0) return false;

  const exact = new Set<string>([entry.pluginId, ...(entry.scopeTokens ?? [])]);

  for (const token of atrScope) {
    if (token === "*") return true;
    if (exact.has(token)) return true;
    if (token.endsWith(".*") && token.slice(0, -2) === entry.pluginId) return true;
    if (token.startsWith(`${entry.pluginId}.`)) return true;
    for (const candidate of exact) {
      if (candidate.startsWith(`${token}.`) || token.startsWith(`${candidate}.`)) {
        return true;
      }
    }
  }
  return false;
}

/** Filter a skill index for search ranking. */
export function filterSkillsByAtr(
  skills: readonly SkillIndexEntry[],
  atrScope: AtrScope | undefined
): readonly SkillIndexEntry[] {
  if (atrScope === undefined) return skills;
  return skills.filter((s) => isSkillVisibleUnderAtr(s, atrScope));
}
