import { describe, expect, it } from "vitest";
import { mergeFilesIntoArgs } from "./mcp-ui-multipart.js";
import {
  createProgressJob,
  getProgressJob,
  isLongRunningTool,
  pushProgressEvent,
  subscribeProgress,
} from "./mcp-ui-progress.js";
import { createGeneratedUi, getGeneratedUiBySlug } from "./mcp-ui-generate.js";
import type { ListedMcpTool } from "mcp-grpc-transport";
import { formHintsForTool, resolveMcpUiTemplate } from "./mcp-ui-templates.js";
import { renderToolFormFields } from "./mcp-ui-form.js";

describe("mcp-ui-multipart mergeFilesIntoArgs", () => {
  it("maps upload into preferred pdf_base64 field", () => {
    const merged = mergeFilesIntoArgs(
      { dry_run: "true" },
      {
        file: {
          filename: "doc.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4"),
        },
      },
      "pdf_base64"
    );
    expect(merged.dry_run).toBe("true");
    expect(merged.pdf_base64).toBe(Buffer.from("%PDF-1.4").toString("base64"));
    expect(merged.base64).toBeUndefined();
    expect(merged.__upload_filename).toBe("doc.pdf");
  });

  it("uses field name when file input is named pdf_base64", () => {
    const merged = mergeFilesIntoArgs(
      {},
      {
        pdf_base64: {
          filename: "a.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("abc"),
        },
      }
    );
    expect(merged.pdf_base64).toBe(Buffer.from("abc").toString("base64"));
  });
});

describe("mcp-ui-progress", () => {
  it("recognizes long-running tools", () => {
    expect(isLongRunningTool("run_idp_pipeline")).toBe(true);
    expect(isLongRunningTool("ouroboros_run_evolutionary_loop")).toBe(true);
    expect(isLongRunningTool("search")).toBe(false);
  });

  it("fans out progress events to subscribers", async () => {
    const job = createProgressJob("run_idp_pipeline");
    expect(getProgressJob(job.id)?.id).toBe(job.id);
    const seen: string[] = [];
    const unsub = subscribeProgress(job, (e) => seen.push(e.type));
    pushProgressEvent(job, { type: "progress", message: "go", percent: 10 });
    pushProgressEvent(job, { type: "complete", message: "done", percent: 100 });
    expect(seen).toEqual(["progress", "complete"]);
    expect(job.done).toBe(true);
    unsub();
  });
});

describe("mcp-ui-generate", () => {
  const tools: ListedMcpTool[] = [
    { name: "search", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
    {
      name: "memory_recall",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
  ];

  it("creates a slug and rejects unknown tools", () => {
    const form = createGeneratedUi(
      {
        title: "Search then recall",
        steps: [{ tool: "search", label: "Search" }, { tool: "memory_recall" }],
      },
      tools
    );
    expect(form.slug).toMatch(/search-then-recall/);
    expect(getGeneratedUiBySlug(form.slug)?.id).toBe(form.id);
    expect(() =>
      createGeneratedUi({ title: "Bad", steps: [{ tool: "nope" }] }, tools)
    ).toThrow(/Unknown tool/);
  });
});

describe("mcp-ui IDP template", () => {
  it("marks pdf_base64 as a file field with multipart form", () => {
    const tool: ListedMcpTool = {
      name: "run_idp_pipeline",
      inputSchema: {
        type: "object",
        properties: {
          pdf_base64: { type: "string", description: "Optional seed PDF (base64)" },
          dry_run: { type: "boolean", default: true },
        },
      },
    };
    expect(resolveMcpUiTemplate(tool)?.fileFields).toContain("pdf_base64");
    const hints = formHintsForTool(tool);
    const rendered = renderToolFormFields(tool, hints);
    expect(rendered.hasFileFields).toBe(true);
    expect(rendered.html).toContain('type="file"');
    expect(rendered.html).toContain('name="pdf_base64"');
  });
});
