/**
 * Shared stdio MCP child env for tests — isolates from developer/CI `~/.ClawQL/clawql.env`
 * (`src/load-env.ts` loads home env with `override: false`).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type StdioChildEnvOverrides = Record<string, string | undefined>;

export function isolatedStdioChildEnv(
  minimalSpec: string,
  overrides: StdioChildEnvOverrides = {}
): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "clawql-stdio-home-"));
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  childEnv.CLAWQL_HOME = home;
  childEnv.CLAWQL_SPEC_PATH = minimalSpec;
  // Pin optional tools off so a polluted host clawql.env cannot leak into assertions.
  childEnv.CLAWQL_ENABLE_OUROBOROS = "0";
  childEnv.CLAWQL_ENABLE_SANDBOX = "0";
  childEnv.CLAWQL_ENABLE_NOTIFY = "0";
  childEnv.CLAWQL_ENABLE_ONYX = "0";
  childEnv.CLAWQL_ENABLE_HITL_LABEL_STUDIO = "0";
  childEnv.CLAWQL_ENABLE_WORKFLOW = "0";
  childEnv.CLAWQL_ENABLE_ARGO_CD = "0";
  childEnv.CLAWQL_ENABLE_CODEGRAPH = "0";
  childEnv.CLAWQL_ENABLE_LANGFUSE_EVAL = "0";
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
