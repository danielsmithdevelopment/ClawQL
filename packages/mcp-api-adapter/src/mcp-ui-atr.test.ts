import { describe, expect, it } from "vitest";
import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  canProcessDocuments,
  filterToolsForAtr,
  isInternalToolName,
  isToolAuthorizedForAtr,
} from "./mcp-ui-atr.js";

const tools: ListedMcpTool[] = [
  { name: "search", inputSchema: { type: "object", properties: {} } },
  { name: "execute", inputSchema: { type: "object", properties: {} } },
  { name: "memory_recall", inputSchema: { type: "object", properties: {} } },
  { name: "memory_ingest", inputSchema: { type: "object", properties: {} } },
  { name: "cache", inputSchema: { type: "object", properties: {} } },
  { name: "audit", inputSchema: { type: "object", properties: {} } },
  { name: "pageindex_build_tree", inputSchema: { type: "object", properties: {} } },
  { name: "ouroboros_run_evolutionary_loop", inputSchema: { type: "object", properties: {} } },
];

describe("mcp-ui-atr", () => {
  it("identifies internal tool prefixes", () => {
    expect(isInternalToolName("ouroboros_run_evolutionary_loop")).toBe(true);
    expect(isInternalToolName("pageindex_build_tree")).toBe(true);
    expect(isInternalToolName("memory_recall")).toBe(false);
  });

  it("admin / * sees everything including internal tools", () => {
    expect(
      filterToolsForAtr(tools, { sub: "a", role: "admin" }, true).map((t) => t.name)
    ).toEqual(tools.map((t) => t.name));
    expect(
      filterToolsForAtr(tools, { sub: "a", scope: ["*"] }, true).map((t) => t.name)
    ).toEqual(tools.map((t) => t.name));
  });

  it("memory+search scope excludes execute and internal tools", () => {
    const atr = { sub: "staff", role: "operator", scope: ["search", "memory"] };
    const names = filterToolsForAtr(tools, atr, true).map((t) => t.name).sort();
    expect(names).toEqual(["memory_ingest", "memory_recall", "search"]);
    expect(isToolAuthorizedForAtr("ouroboros_run_evolutionary_loop", atr)).toBe(false);
    expect(isToolAuthorizedForAtr("pageindex_build_tree", atr)).toBe(false);
    expect(isToolAuthorizedForAtr("execute", atr)).toBe(false);
  });

  it("explicit tools list can grant internal tools without family scope", () => {
    const atr = {
      sub: "dev",
      scope: ["search"],
      tools: ["pageindex_build_tree"],
    };
    expect(isToolAuthorizedForAtr("search", atr)).toBe(true);
    expect(isToolAuthorizedForAtr("pageindex_build_tree", atr)).toBe(true);
    expect(isToolAuthorizedForAtr("ouroboros_run_evolutionary_loop", atr)).toBe(false);
  });

  it("family scopes pageindex / ouroboros grant internal prefixes", () => {
    expect(
      isToolAuthorizedForAtr("pageindex_build_tree", {
        sub: "x",
        scope: ["pageindex"],
      })
    ).toBe(true);
    expect(
      isToolAuthorizedForAtr("ouroboros_run_evolutionary_loop", {
        sub: "x",
        scope: ["ouroboros"],
      })
    ).toBe(true);
  });

  it("atrScoped=false returns the full catalog", () => {
    expect(
      filterToolsForAtr(tools, { sub: "x", scope: ["search"] }, false).map((t) => t.name)
    ).toEqual(tools.map((t) => t.name));
  });

  it("documents/idp capability scopes grant IDP tools", () => {
    expect(
      isToolAuthorizedForAtr("run_idp_pipeline", { sub: "ops", scope: ["documents"] })
    ).toBe(true);
    expect(
      isToolAuthorizedForAtr("run_idp_pipeline", { sub: "ops", scope: ["idp"] })
    ).toBe(true);
    expect(
      isToolAuthorizedForAtr("run_idp_pipeline", { sub: "ops", scope: ["memory"] })
    ).toBe(false);
  });

  it("canProcessDocuments is separate from generic capability scopes", () => {
    expect(canProcessDocuments({ sub: "a", role: "admin" })).toBe(true);
    expect(canProcessDocuments({ sub: "a", scope: ["*"] })).toBe(true);
    expect(canProcessDocuments({ sub: "a", scope: ["documents"] })).toBe(true);
    expect(canProcessDocuments({ sub: "a", scope: ["idp"] })).toBe(true);
    expect(canProcessDocuments({ sub: "a", scope: ["memory", "search"] })).toBe(false);
    expect(
      canProcessDocuments({ sub: "a", scope: ["search"], tools: ["run_idp_pipeline"] })
    ).toBe(true);
  });
});
