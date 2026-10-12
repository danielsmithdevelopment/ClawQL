/**
 * GW-17 — Official OpenAI Python SDK against ClawQL POST /v1/decisions.
 * Spawns scripts/openai_decisions_sdk_conformance.py against a local router.
 *
 * Must use async spawn (not spawnSync): a sync child blocks the Node event loop,
 * so Express cannot answer the Python client's HTTP requests (deadlock).
 */

import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createDecisionRouter } from "./router.js";
import { resetDecisionRuntime, useHeuristicDecisionStackForTests } from "./service.js";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/openai_decisions_sdk_conformance.py"
);

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function runCommand(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function ensurePythonOpenAI(): Promise<void> {
  const probe = await runCommand("python3", ["-c", "import openai; print(openai.__version__)"]);
  if (probe.status === 0) return;
  const install = await runCommand("python3", [
    "-m",
    "pip",
    "install",
    "--user",
    "-q",
    "openai>=1.0",
  ]);
  if (install.status !== 0) {
    throw new Error(
      `Could not install openai for Python SDK test:\n${install.stderr || install.stdout}`
    );
  }
}

describe("GW-17 OpenAI Python SDK /v1/decisions conformance", () => {
  let server: Server;
  let baseURL: string;

  beforeEach(async () => {
    useHeuristicDecisionStackForTests();
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    app.use(createDecisionRouter({ env: {} }));
    server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");
    baseURL = `http://127.0.0.1:${address.port}/v1`;
  });

  afterEach(async () => {
    resetDecisionRuntime();
    await closeHttpServer(server);
  });

  it("passes official Python SDK matrix", async () => {
    await ensurePythonOpenAI();
    const run = await runCommand("python3", [scriptPath], {
      ...process.env,
      CLAWQL_DECISIONS_BASE_URL: baseURL,
    });
    if (run.status !== 0) {
      expect.fail(
        `GW-17 Python SDK conformance failed (exit ${run.status}):\n${run.stdout}\n${run.stderr}`
      );
    }
    expect(run.stdout).toMatch(/PASS/);
  }, 120_000);
});
