import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { createX402Gate } from "./gate.js";
import {
  runMcpX402BeforeCallTool,
  runWithMcpX402Context,
  X402McpPaymentDeniedError,
  X402McpPaymentRequiredError,
} from "./index.js";

describe("runMcpX402BeforeCallTool", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-mcp-"));
    env = {
      ...process.env,
      CLAWQL_HOME: home,
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
      CLAWQL_X402_ENFORCE: "1",
    };
    await mkdir(join(home, "Payments"), { recursive: true });
    await writeFile(
      join(home, "Payments", "payments.json"),
      `${JSON.stringify(
        {
          tenantId: "tenant-a",
          plan: "pro",
          x402: {
            walletAddress: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            facilitatorUrl: "https://x402.org/facilitator",
          },
        },
        null,
        2
      )}\n`
    );
    await resetPaymentAuditStoreForTests(env);
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("allows ungated tools", async () => {
    await expect(runMcpX402BeforeCallTool({ toolName: "search", env })).resolves.toBeUndefined();
  });

  it("throws payment required for gated tool without proof", async () => {
    await createX402Gate({ tool: "knowledge_search", price: 0.0005, asset: "USDC" }, env);

    await expect(
      runMcpX402BeforeCallTool({ toolName: "knowledge_search", env })
    ).rejects.toBeInstanceOf(X402McpPaymentRequiredError);
  });

  it("allows gated tool when facilitator verifies proof from MCP context headers", async () => {
    await createX402Gate({ tool: "knowledge_search", price: 0.0005, asset: "USDC" }, env);

    const payload = { x402Version: 2, payload: { signature: "0xabc" } };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ isValid: true, payer: "0xpayer" }),
    }));

    await runWithMcpX402Context(
      {
        headers: { "payment-signature": header },
        requestUrl: "mcp://tool/knowledge_search",
        correlationId: "corr-mcp",
      },
      async () => {
        await expect(
          runMcpX402BeforeCallTool({
            toolName: "knowledge_search",
            env,
            fetchImpl: fetchImpl as unknown as typeof fetch,
          })
        ).resolves.toBeUndefined();
      }
    );
  });

  it("throws payment denied when facilitator rejects proof", async () => {
    await createX402Gate({ tool: "knowledge_search", price: 0.0005, asset: "USDC" }, env);

    const payload = { x402Version: 2, payload: { signature: "0xbad" } };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ isValid: false, invalidReason: "bad sig" }),
    }));

    await runWithMcpX402Context(
      { headers: { "payment-signature": header }, requestUrl: "mcp://tool/knowledge_search" },
      async () => {
        await expect(
          runMcpX402BeforeCallTool({
            toolName: "knowledge_search",
            env,
            fetchImpl: fetchImpl as unknown as typeof fetch,
          })
        ).rejects.toBeInstanceOf(X402McpPaymentDeniedError);
      }
    );
  });
});
