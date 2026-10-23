#!/usr/bin/env bun
/**
 * Smoke: TS dataplane-forward → live clawql-dataplane execute (pets self-mock).
 *
 *   bun scripts/dataplane/dual-process-forward-smoke.mjs
 *   CLAWQL_DATAPLANE_EXECUTE_URL=http://127.0.0.1:8787 bun scripts/dataplane/dual-process-forward-smoke.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Effect } from "effect";
import {
  callDataplaneToolEffect,
  resolveDataplaneForwardConfig,
} from "../../packages/clawql-api/src/execute/dataplane-forward.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const bin = join(root, "crates/target/release/clawql-dataplane");

function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitHealth(port, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`dataplane healthz timeout :${port}`);
}

let child = null;
let baseUrl = process.env.CLAWQL_DATAPLANE_EXECUTE_URL?.trim() || "";

try {
  if (!baseUrl) {
    const port = await pickPort();
    child = spawn(bin, ["--self-mock", "--bind", `127.0.0.1:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAWQL_DATAPLANE_GOVERNANCE: "1",
        CLAWQL_ENABLE_SESSION_IFC: "0",
        CLAWQL_WORM_ENABLED: "0",
        CLAWQL_HOME: `/tmp/clawql-dp-smoke-${port}`,
      },
    });
    baseUrl = `http://127.0.0.1:${port}`;
    await waitHealth(port);
  }

  const env = { ...process.env, CLAWQL_DATAPLANE_EXECUTE_URL: baseUrl };
  const cfg = resolveDataplaneForwardConfig(env);
  if (!cfg) throw new Error("forward disabled");

  const out = await Effect.runPromise(
    callDataplaneToolEffect("execute", { operationId: "mock_listPets", args: {} }, env)
  );
  const text = out.content[0]?.text ?? "";
  const parsed = JSON.parse(text);
  if (parsed.proxiedFrom !== "clawql-mcp") {
    throw new Error(`missing proxiedFrom stamp: ${text.slice(0, 200)}`);
  }
  console.log(
    JSON.stringify({
      ok: true,
      transport: out.transport,
      url: cfg.url,
      proxiedFrom: parsed.proxiedFrom,
    })
  );
} finally {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
}
