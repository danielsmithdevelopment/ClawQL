import { describe, expect, it } from "vitest";
import { runRenderClaimButtonFragment } from "./mcp-ui-claim-html.js";
import { renderMcpUiCatalogPage } from "./mcp-ui-html.js";
import { isClaimButtonTool, resolveMcpUiTemplate } from "./mcp-ui-templates.js";

describe("mcp-ui claim-button template", () => {
  it("matches cf_claim_coupon and claim_* coupon tools", () => {
    expect(
      isClaimButtonTool({
        name: "cf_claim_coupon",
        description: "Claim the challenge coupon",
        inputSchema: {},
      })
    ).toBe(true);
    expect(
      isClaimButtonTool({
        name: "claim_coupon",
        description: "Claim coupon",
        inputSchema: {},
      })
    ).toBe(true);
    expect(
      isClaimButtonTool({
        name: "search",
        description: "Search ops",
        inputSchema: {},
      })
    ).toBe(false);
  });

  it("resolves claim-button customHtml", () => {
    const t = resolveMcpUiTemplate({
      name: "cf_claim_coupon",
      description: "Claim coupon",
      inputSchema: {},
    });
    expect(t?.customHtml).toBe("claim-button");
  });

  it("renders click-to-claim fragment with execute URL", () => {
    const html = runRenderClaimButtonFragment("cf_claim_coupon", "/mcp-ui");
    expect(html).toContain('id="claim-cf_claim_coupon"');
    expect(html).toContain('hx-post="/mcp-ui/execute/cf_claim_coupon"');
    expect(html).toContain("Click to claim");
    expect(html).toContain("Claim coupon");
    expect(html).not.toContain("{{toolName}}");
  });

  it("uses claim-button card in catalog page", () => {
    const page = renderMcpUiCatalogPage({
      title: "Test",
      tools: [
        {
          name: "cf_claim_coupon",
          description: "Claim the challenge coupon",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      fetchedAt: new Date().toISOString(),
      upstream: "test",
    });
    expect(page).toContain("Template · cf_claim_coupon");
    expect(page).toContain("mcp-ui-claim");
    expect(page).toContain('hx-post="/mcp-ui/execute/cf_claim_coupon"');
    expect(page).toContain("Click to claim");
  });
});
