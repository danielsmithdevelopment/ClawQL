/**
 * Benign suite — every tool declared in the ClawQL OpenAPPA battery must
 * receive allow_call (or an expected mandate) under a mock that mirrors
 * the deny-by-default battery.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { openAppaBeforeToolCallEffect, resetOpenAppaSessionCacheForTests } from "./gate.js";
import type { OpenAppaConfig } from "./config.js";

const batteryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../openappa/batteries/clawql/appa.toml"
);

function declaredTools(): string[] {
  const text = readFileSync(batteryPath, "utf8");
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*name\s*=\s*"mcp\/clawql\/([^"]+)"/);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

/** Tools that require human-approval in the battery (expect mandate, not allow). */
const ATTENTION_TOOLS = new Set(["notify", "sources_propose", "clawql_settings_update"]);

/** Tools that require trusted trajectory — first call on a fresh session may still allow. */
const TRUSTED_TOOLS = new Set(["memory_ingest", "memory_sync", "execute", "resume", "clawql_open_file"]);

function startMock(handler: (tool: string) => { decision: string; feedback?: string }): Promise<{
  server: Server;
  url: string;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        event?: string;
        tool?: string;
      };
      let reply: Record<string, unknown>;
      if (body.event === "session_start") {
        reply = { protocol: 1, decision: "ack" };
      } else {
        const bare = String(body.tool ?? "").replace(/^mcp__clawql__/, "");
        const d = handler(bare);
        reply = {
          protocol: 1,
          decision: d.decision,
          ...(d.feedback ? { feedback: d.feedback } : {}),
        };
      }
      res.writeHead(dStatus(reply.decision as string), { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no addr"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function dStatus(decision: string): number {
  return decision === "refuse" ? 409 : 200;
}

describe("OpenAPPA benign suite (declared tools)", () => {
  let mock: { server: Server; url: string } | undefined;

  afterEach(async () => {
    resetOpenAppaSessionCacheForTests();
    if (mock) {
      await new Promise<void>((r) => mock!.server.close(() => r()));
      mock = undefined;
    }
  });

  it("battery declares at least core tools", () => {
    const tools = declaredTools();
    expect(tools).toContain("search");
    expect(tools).toContain("execute");
    expect(tools).toContain("notify");
    expect(tools.length).toBeGreaterThanOrEqual(10);
  });

  it("every declared tool's benign path passes the gate (allow or expected mandate)", async () => {
    const tools = declaredTools();
    mock = await startMock((tool) => {
      if (ATTENTION_TOOLS.has(tool)) {
        return {
          decision: "deny_call",
          feedback: "requires attention: human-approval",
        };
      }
      return { decision: "allow_call" };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      readFailurePolicy: "block",
      timeoutMs: 3000,
      allowCacheMs: 0,
      authToken: null,
      isLoopback: true,
    };

    const results: { tool: string; ok: boolean; status: string }[] = [];
    for (const tool of tools) {
      resetOpenAppaSessionCacheForTests();
      const verdict = await Effect.runPromise(
        openAppaBeforeToolCallEffect({
          toolName: tool,
          args: { query: "benign" },
          sessionId: `benign-${tool}`,
          callId: `b-${tool}`,
          config,
        })
      );
      if (ATTENTION_TOOLS.has(tool)) {
        const ok = !verdict.allow && verdict.status === "mandate_required";
        results.push({ tool, ok, status: verdict.allow ? "allow" : verdict.status });
        expect(ok, tool).toBe(true);
      } else {
        results.push({
          tool,
          ok: verdict.allow,
          status: verdict.allow ? "allow" : verdict.status,
        });
        expect(verdict.allow, `${tool} should allow (trusted=${TRUSTED_TOOLS.has(tool)})`).toBe(
          true
        );
      }
    }
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
