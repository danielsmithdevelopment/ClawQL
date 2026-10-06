/**
 * ATR visibility for skill index rows (spec §6.4 / §7.3).
 * Standalone skills are not gated by tool ATR; provider-bundled skills inherit it.
 * Operator-audience skills never appear in the agent catalog.
 */

import type { AtrScope, SkillIndexEntry } from "./provider-types.js";

/** Agent-facing catalog: omit operator runbooks even when ATR is unset. */
export function isAgentFacingSkill(entry: SkillIndexEntry): boolean {
  return entry.audience !== "operator";
}

/**
 * Whether a skill index entry may appear in `search` / `skills_list` under session ATR.
 *
 * - Operator-audience skills — never visible to agents.
 * - `atrScope === undefined` — host has no ATR context; do not filter remaining skills (dev / ungated).
 * - Standalone skills — always visible (applicability still applies at ranking).
 * - Provider skills — visible iff ATR is non-empty and matches plugin id / tool tokens.
 */
export function isSkillVisibleUnderAtr(
  entry: SkillIndexEntry,
  atrScope: AtrScope | undefined
): boolean {
  if (!isAgentFacingSkill(entry)) return false;
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

/** Filter a skill index for search ranking (always drops operator skills). */
export function filterSkillsByAtr(
  skills: readonly SkillIndexEntry[],
  atrScope: AtrScope | undefined
): readonly SkillIndexEntry[] {
  return skills.filter((s) => isSkillVisibleUnderAtr(s, atrScope));
}
