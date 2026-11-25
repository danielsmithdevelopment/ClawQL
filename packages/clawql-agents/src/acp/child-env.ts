/**
 * Audit 5.05 / 2.13: ACP child processes must not inherit gateway secrets.
 * Same policy as OpenBench harness (`buildHarnessChildEnv`).
 */

const ACP_ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_RUNTIME_DIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "CLAWQL_HOME",
  "CLAWQL_OBSIDIAN_VAULT_PATH",
  "CLAWQL_ENABLE_MEMORY",
  "CLAWQL_BUNDLED_OFFLINE",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  // Agent CLI model logins — not gateway secrets.
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_API_KEY",
  "CURSOR_API_KEY",
]);

/**
 * Build a filtered environment for ACP agent spawns.
 * Strips ClawQL gateway credentials, cloud provider vault secrets, and
 * other `*_KEY` / `*_TOKEN` / `*_SECRET` values unless allowlisted.
 */
export function filterAcpChildEnv(
  source: NodeJS.ProcessEnv = process.env,
  extras: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(source)) {
    if (v == null) continue;
    if (/^CLAWQL_.*(KEY|TOKEN|SECRET|PASSWORD)/i.test(k) && k !== "CLAWQL_HOME") continue;
    if (/^(AWS_|AZURE_|GCP_|GOOGLE_APPLICATION_|STRIPE_|GITHUB_TOKEN)/i.test(k)) continue;
    if (ACP_ENV_ALLOWLIST.has(k) || k.startsWith("CLAWQL_")) {
      childEnv[k] = v;
      continue;
    }
    if (/(_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS)$/i.test(k)) continue;
  }
  for (const [k, v] of Object.entries(extras)) {
    if (v != null) childEnv[k] = v;
  }
  return childEnv;
}
