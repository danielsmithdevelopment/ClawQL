/**
 * Env gating for ChatGPT MCP Extensions.
 *
 * `CLAWQL_ENABLE_CHATGPT_EXTENSIONS` defaults **on**. Set `0` / `false` / `no` to disable.
 */

export function isChatgptExtensionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ENABLE_CHATGPT_EXTENSIONS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === undefined || raw === "") return true;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Admin-bounded approval timeout defaults (minutes). */
export const APPROVAL_TIMEOUT = {
  minMinutes: 1,
  maxMinutes: 60,
  defaultMinutes: 15,
} as const;
