#!/usr/bin/env npx tsx
/**
 * Self-contained board + MCP tools smoke (starts local API, hydrates, calls tools).
 *
 *   npm run demo:board-mcp-smoke
 */

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";
import { postBoardView, toBoardTaskView, writeDemoSnapshot } from "./board-view.js";

const PORT = Number(process.env.PORT ?? 8791);
const API = `http://127.0.0.1:${PORT}`;
const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/board-mcp-smoke");

async function waitForHealth(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API}/healthz`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`board did not become healthy on ${API}`);
}

async function main(): Promise<void> {
  let child: ChildProcess | undefined;
  try {
    child = spawn("npx", ["tsx", "scripts/local-api-server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    await waitForHealth(15_000);

    const result = await runLocalDemo({
      root,
      decisionsMode: "calibrated",
      approveIfNeeded: true,
    });
    const view = toBoardTaskView(result);
    writeDemoSnapshot(root, result, view);
    await postBoardView(API, view);

    const toolsRes = await fetch(`${API}/mcp/tools`);
    if (!toolsRes.ok) throw new Error(`GET /mcp/tools ${toolsRes.status}`);
    const toolsBody = (await toolsRes.json()) as { tools: Array<{ name: string }> };
    const names = toolsBody.tools.map((t) => t.name);
    for (const need of ["task_get", "attempt_status", "evidence_get", "claim_paths"]) {
      if (!names.includes(need)) throw new Error(`missing tool ${need}`);
    }

    const call = await fetch(`${API}/mcp/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: result.task.id,
        attemptId: "att_1",
        name: "attempt_status",
        arguments: {},
      }),
    });
    if (!call.ok) throw new Error(`POST /mcp/tools/call ${call.status}`);
    const callBody = (await call.json()) as { ok: boolean; data?: unknown };
    if (!callBody.ok) throw new Error(`attempt_status failed: ${JSON.stringify(callBody)}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          board: `${API}/?task=${result.task.id}`,
          tools: names,
          attemptStatusOk: true,
          canaryPercent: view.canary.canaryPercent,
        },
        null,
        2
      )
    );
    console.log("\nBOARD MCP SMOKE PASS");
  } finally {
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
      await new Promise((r) => setTimeout(r, 200));
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
