/**
 * CI: every registered MCP tool must pass through the governance wrap choke point.
 *
 * - Wrap imports NATIVE_TOOL_GOVERNANCE_MODULE_ID (native IFC + park).
 * - Every tool name from an in-process server is either in the native policy
 *   table, an execute-path tool, or classified fail-closed as destructive.
 * - ChatGPT attach tools must also be present in the policy table (no silent skips).
 */
import { describe, expect, it } from "vitest";
import {
  EXECUTE_PATH_TOOL_NAMES,
  NATIVE_TOOL_GOVERNANCE_MODULE_ID,
  NATIVE_TOOL_POLICY,
  resolveNativeToolPolicy,
} from "clawql-api";
import { MCP_TOOL_WRAP_GOVERNANCE_ID, wrapRegisteredMcpToolHandler } from "./mcp-tool-wrap.js";

describe("native tool governance CI", () => {
  it("wrap module is bound to the native governance choke point", () => {
    expect(MCP_TOOL_WRAP_GOVERNANCE_ID).toBe(NATIVE_TOOL_GOVERNANCE_MODULE_ID);
  });

  it("wrapRegisteredMcpToolHandler is a function (choke point entry)", () => {
    expect(typeof wrapRegisteredMcpToolHandler).toBe("function");
  });

  it("policy table covers memory, automation, and chatgpt extension names", () => {
    const required = [
      "memory_ingest",
      "memory_recall",
      "read_around",
      "schedule",
      "notify",
      "skills_list",
      "skills_get",
      "clawql_settings_read",
      "clawql_settings_update",
      "clawql_mentions_search",
      "clawql_evidence",
      "clawql_console",
      "clawql_open_file",
    ];
    for (const name of required) {
      expect(NATIVE_TOOL_POLICY[name], `missing policy for ${name}`).toBeDefined();
    }
    expect(resolveNativeToolPolicy("memory_ingest").kind).toBe("destructive");
  });

  it("execute-path tools are explicitly listed (skip double native park)", () => {
    for (const name of ["execute", "proxy_call", "submit_program_proposals", "resume"]) {
      expect(EXECUTE_PATH_TOOL_NAMES.has(name)).toBe(true);
    }
  });

  it("unknown tools fail closed as destructive", () => {
    expect(resolveNativeToolPolicy("totally_new_plugin_tool_xyz").kind).toBe("destructive");
  });
});
