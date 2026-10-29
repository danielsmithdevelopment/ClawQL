/**
 * Unit contract for ProgramCellDO await_approval without a live celld:
 * exercises runAwaitApprovalStep via a fake storage + env.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { ProgramCellDO } from "../src/program-cell-do.js";

function memoryStorage() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    _map: map,
  };
}

async function withPendingServer(fn) {
  /** @type {Map<string, string>} */
  const pending = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname.startsWith("/__pending/")) {
      const id = decodeURIComponent(url.pathname.slice("/__pending/".length));
      if (!pending.has(id)) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, status: null }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: pending.get(id) }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    await fn({
      port,
      set: (id, status) => pending.set(id, status),
      upstream: `http://127.0.0.1:${port}`,
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

await withPendingServer(async ({ set, upstream }) => {
  const storage = memoryStorage();
  const cell = new ProgramCellDO({ storage }, { CLAWQL_CORE_UPSTREAM: upstream });
  const programId = "prog_await_test";
  const meta = {
    programId,
    status: "running",
    plan: {
      v: 1,
      mode: "sequential",
      calls: [{ tool: "await_approval", executionId: "pex_1" }],
    },
  };
  await storage.put(`program:${programId}:meta`, meta);

  set("pex_1", "pending");
  const parked = await cell.runAwaitApprovalStep(
    programId,
    { tool: "await_approval", executionId: "pex_1" },
    0,
    [],
    meta
  );
  assert.equal(parked.done, true);
  const parkedBody = await parked.response.json();
  assert.equal(parkedBody.status, "parked");
  assert.equal(parkedBody.code, "awaiting_approval");
  assert.equal(
    await storage.get(`program:${programId}:nondet:await_approval.0.executionId`),
    "pex_1"
  );

  // Still pending on resume path.
  const still = await cell.runAwaitApprovalStep(
    programId,
    { tool: "await_approval", executionId: "pex_1" },
    0,
    [],
    meta
  );
  assert.equal(still.done, true);
  assert.equal((await still.response.json()).code, "awaiting_approval");

  set("pex_1", "approved");
  const landed = await cell.runAwaitApprovalStep(
    programId,
    { tool: "await_approval", executionId: "pex_1" },
    0,
    [],
    meta
  );
  assert.equal(landed.done, false);
  assert.equal(landed.entry.tool, "await_approval");
  assert.equal(landed.entry.result.ok, true);
  assert.equal(landed.entry.result.status, "approved");
});

console.log("program-cell-await.test: PASS");
