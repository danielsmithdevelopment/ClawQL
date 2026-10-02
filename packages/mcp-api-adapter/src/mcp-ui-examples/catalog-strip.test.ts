import { describe, expect, it } from "vitest";
import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  runRenderCatalogStarterStrip,
  runSelectCatalogStarterLinks,
} from "./catalog-strip.js";

function tool(name: string, description = name): ListedMcpTool {
  return { name, description, inputSchema: { type: "object", properties: {} } };
}

describe("catalog starter strip", () => {
  it("keeps adapter demos collapsed and unmarked unless the live catalog matches", () => {
    const links = runSelectCatalogStarterLinks([tool("search")], "/mcp-ui");
    expect(links.find((l) => l.id === "agent-lab")?.relevant).toBe(false);
    expect(links.find((l) => l.id === "cloudflare-claim")?.relevant).toBe(false);
    expect(links.find((l) => l.id === "flamegraph")?.relevant).toBe(false);

    const html = runRenderCatalogStarterStrip([tool("search")], "/mcp-ui");
    expect(html).toContain("<details class=\"starter-demos\">");
    expect(html).not.toContain("starter-relevant");
    expect(html).toContain("/mcp-ui/presets/agent-lab");
    expect(html).toContain("/mcp-ui/trace/compare");
  });

  it("surfaces Agent Lab only when two or more workflow candidates exist", () => {
    const links = runSelectCatalogStarterLinks(
      [tool("search"), tool("memory_recall")],
      "/mcp-ui"
    );
    expect(links.find((l) => l.id === "agent-lab")?.relevant).toBe(true);
    const html = runRenderCatalogStarterStrip(
      [tool("search"), tool("memory_recall")],
      "/mcp-ui"
    );
    expect(html).toContain("starter-relevant");
    expect(html).toContain("Agent Lab");
  });

  it("surfaces click-to-claim when a claim tool is in the catalog", () => {
    const links = runSelectCatalogStarterLinks([tool("cf_claim_coupon")], "/mcp-ui");
    expect(links.find((l) => l.id === "cloudflare-claim")?.relevant).toBe(true);
    expect(runRenderCatalogStarterStrip([tool("cf_claim_coupon")], "/mcp-ui")).toContain(
      "Click-to-claim"
    );
  });
});
