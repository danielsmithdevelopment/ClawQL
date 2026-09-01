import { describe, expect, it } from "vitest";
import { renderMcpUiCatalogPage } from "./mcp-ui-html.js";
import { renderSmartUploadFragment } from "./mcp-ui-smart-upload-html.js";
import { isSmartUploadTool, resolveMcpUiTemplate } from "./mcp-ui-templates.js";

describe("mcp-ui smart-upload template", () => {
  it("matches upload_photo and upload-image style tools", () => {
    expect(isSmartUploadTool({ name: "upload_photo", inputSchema: {} })).toBe(true);
    expect(isSmartUploadTool({ name: "upload_image", inputSchema: {} })).toBe(true);
    expect(
      isSmartUploadTool({
        name: "gallery_add",
        description: "Upload a photo to the gallery",
        inputSchema: { properties: { file: { type: "string" } } },
      })
    ).toBe(true);
    expect(isSmartUploadTool({ name: "search", inputSchema: {} })).toBe(false);
  });

  it("resolves smart-upload template with customHtml", () => {
    const t = resolveMcpUiTemplate({ name: "upload_photo", inputSchema: {} });
    expect(t?.id).toBe("upload_photo");
    expect(t?.customHtml).toBe("smart-upload");
  });

  it("renders fragment with tool name and base path", () => {
    const html = renderSmartUploadFragment("upload_photo", "/mcp-ui");
    expect(html).toContain('id="smart-upload-upload_photo"');
    expect(html).toContain('hx-post="/mcp-ui/execute/upload_photo"');
    expect(html).toContain("createImageBitmap");
    expect(html).not.toContain("{{toolName}}");
  });

  it("uses smart-upload card in catalog page", () => {
    const page = renderMcpUiCatalogPage({
      title: "Test",
      tools: [
        {
          name: "upload_photo",
          description: "Upload a photo",
          inputSchema: {
            type: "object",
            properties: {
              file: { type: "string" },
              filename: { type: "string" },
            },
          },
        },
      ],
      fetchedAt: new Date().toISOString(),
      upstream: "test",
    });
    expect(page).toContain("Template · upload_photo");
    expect(page).toContain("mcp-ui-smart-upload");
    expect(page).toContain('hx-post="/mcp-ui/execute/upload_photo"');
  });
});
