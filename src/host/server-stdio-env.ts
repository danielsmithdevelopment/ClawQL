/**
 * Shared stdio MCP child env for tests — isolates from developer/CI `~/.ClawQL/clawql.env`
 * (`src/load-env.ts` loads home env with `override: false`).
 *
 * Plugin enablement uses {@link CLAWQL_INSTANCE_SPEC} (tier config), not `CLAWQL_ENABLE_*`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type StdioChildEnvOverrides = Record<string, string | undefined>;

/** Minimal local-tier instance spec: memory on, documents on, opt-in plugins off. */
export const STDIO_TEST_INSTANCE_SPEC = JSON.stringify({
  tier: "local",
  memory: { enabled: true },
  documents: { enabled: true },
  sandbox: { enabled: false },
  data: { enabled: false },
  automation: {
    schedule: { enabled: false },
    notify: { enabled: false },
    workflow: { enabled: false },
    argocd: { enabled: false },
    hitlLabelStudio: { enabled: false },
  },
});

export function isolatedStdioChildEnv(
  minimalSpec: string,
  overrides: StdioChildEnvOverrides = {}
): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "clawql-stdio-home-"));
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  childEnv.CLAWQL_HOME = home;
  childEnv.CLAWQL_SPEC_PATH = minimalSpec;
  childEnv.CLAWQL_INSTANCE_SPEC = STDIO_TEST_INSTANCE_SPEC;
  delete childEnv.CLAWQL_INSTANCE_SPEC_FILE;
  delete childEnv.CLAWQL_OBSIDIAN_VAULT_PATH;
  delete childEnv.CLAWQL_PROVIDER;
  delete childEnv.CLAWQL_SPEC_PATHS;
  delete childEnv.CLAWQL_API_BASE_URL;
  delete childEnv.API_BASE_URL;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  return childEnv;
}

/** Merge plugin toggles into a CLAWQL_INSTANCE_SPEC JSON string for tests. */
export function instanceSpecWith(
  patch: Record<string, unknown>,
  base: Record<string, unknown> = JSON.parse(STDIO_TEST_INSTANCE_SPEC) as Record<string, unknown>
): string {
  const merged: Record<string, unknown> = { ...base, ...patch };
  for (const key of ["documents", "automation", "ouroboros", "mcp"] as const) {
    const b = base[key];
    const p = patch[key];
    if (
      b &&
      typeof b === "object" &&
      !Array.isArray(b) &&
      p &&
      typeof p === "object" &&
      !Array.isArray(p)
    ) {
      merged[key] = { ...(b as Record<string, unknown>), ...(p as Record<string, unknown>) };
    }
  }
  return JSON.stringify(merged);
}
