import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateToolCli, renderGeneratedCliSource } from "./gen-cli.js";

describe("gen-cli", () => {
  const tools = [
    {
      name: "echo",
      description: "Echo",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
    {
      name: "add",
      description: "Add",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      },
    },
  ];

  it("renders a CLI that lists tools", () => {
    const src = renderGeneratedCliSource({
      name: "demo-tools",
      baseUrl: "http://127.0.0.1:8090",
      tools,
    });
    expect(src).toContain("demo-tools");
    expect(src).toContain("echo");
    expect(src).toContain("add");
    expect(src).toContain("POST");
  });

  it("writes package files", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mcp-api-adapter-cli-"));
    const result = await generateToolCli({
      outDir,
      name: "demo-tools",
      baseUrl: "http://127.0.0.1:8090",
      tools,
      upstreamLabel: "test",
    });
    expect(result.binName).toBe("demo-tools");
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    expect(pkg.bin["demo-tools"]).toBe("bin/demo-tools.mjs");
    const bin = await readFile(join(outDir, "bin/demo-tools.mjs"), "utf8");
    expect(bin).toContain("echo");
  });
});
