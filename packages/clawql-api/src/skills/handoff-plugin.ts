/**
 * Standalone skill pack — session handoff / recap (spec §7).
 * Default-on for 8.0 so `search` surfaces a universal skill without a fake provider.
 */

import { defineStandaloneSkillPlugin, type StandaloneSkillPlugin } from "clawql-core";

export const HANDOFF_SKILL_PLUGIN_ID = "handoff";

const SESSION_HANDOFF_MD = `# Session handoff

Summarize the current agent session so another agent (or human) can continue without re-deriving context.

## When to use

- Mid-task handoff to a new conversation or teammate
- End-of-turn recap before context window pressure
- Escalation to a specialist agent with a different tool ATR

## What to capture

1. **Goal** — what the user asked for (one sentence)
2. **Done** — decisions and artifacts already produced (paths, PR links, tool outcomes)
3. **Open** — blockers, unanswered questions, next concrete step
4. **Constraints** — env flags, ATR/scope limits, secrets not to re-request
5. **Pointers** — vault note titles, WORM correlation ids, relevant \`skills_get\` skillIds

## Style

- Prefer bullets over prose
- No secrets, tokens, or full credential values
- Link vault notes with \`[[wikilink]]\` titles when they exist
`;

/** Universal standalone skill — \`applicability: always\` so every \`search\` can surface it. */
export function createHandoffSkillPlugin(): StandaloneSkillPlugin {
  return defineStandaloneSkillPlugin({
    id: HANDOFF_SKILL_PLUGIN_ID,
    version: "1.0.0",
    description: "Session handoff and trajectory recap skills (no owning provider)",
    skills: [
      {
        skillId: "session-handoff",
        name: "Session handoff",
        description:
          "Summarize this session for handoff to another agent or conversation — goals, done, open, constraints",
        applicability: "always",
        content: SESSION_HANDOFF_MD,
      },
    ],
    vaultSeed: [
      {
        title: "Handoff skill pack",
        content:
          "ClawQL ships a standalone `session-handoff` skill (plugin id `handoff`). " +
          "Discover via `search` or `skills_list`; fetch body with `skills_get`.",
        ontologyType: "runbook",
      },
    ],
  });
}

/** Default on — set \`CLAWQL_ENABLE_HANDOFF_SKILL=0\` to omit. */
export function handoffSkillPluginEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_HANDOFF_SKILL?.trim() !== "0";
}
