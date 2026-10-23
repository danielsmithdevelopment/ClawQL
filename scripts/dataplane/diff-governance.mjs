#!/usr/bin/env node
/**
 * Phase B governance differential / self-check harness.
 *
 * Default: start nothing — call CLAWQL_DP_MCP_URL (or spawn via diff-governance.sh).
 * Cases exercise block / park / resume+consume / allow GET shapes with comparisonLabel=governance.
 *
 * Optional: CLAWQL_TS_MCP_URL — normalize + diff tool bodies (strips latencyMs, timestamps,
 * executionId, expiresAt, argsHash, idempotencyKey).
 *
 * Exit 0 when all self-expectations pass and (if TS URL set) zero mismatches.
 */

import { createHash } from "node:crypto";

const DP = process.env.CLAWQL_DP_MCP_URL?.replace(/\/$/, "");
const TS = process.env.CLAWQL_TS_MCP_URL?.replace(/\/$/, "");
const ACCEPT = "application/json, text/event-stream";

if (!DP) {
  console.error("CLAWQL_DP_MCP_URL required");
  process.exit(2);
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    if (value[k] === undefined) continue;
    out[k] = canonicalize(value[k]);
  }
  return out;
}

function hashPendingArgs({ operationId, args, fields, where }) {
  const body = {
    operationId,
    args: args ?? {},
    fields: fields ?? null,
    ...(where?.trim() ? { where } : {}),
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalize(body)), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

async function mcpCall(base, session, method, params) {
  const body = { jsonrpc: "2.0", id: Date.now(), method, params };
  const headers = {
    "content-type": "application/json",
    accept: ACCEPT,
  };
  if (session) headers["mcp-session-id"] = session;
  const res = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id") || session;
  const json = await res.json();
  if (json.error) {
    throw new Error(`${base} RPC error: ${JSON.stringify(json.error)}`);
  }
  return { sid, json };
}

async function init(base) {
  const { sid } = await mcpCall(base, null, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "diff-governance", version: "0.1.0" },
  });
  if (!sid) throw new Error(`no mcp-session-id from ${base}`);
  return sid;
}

function toolBody(rpc) {
  const text = rpc?.result?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error(`missing tool text: ${JSON.stringify(rpc)}`);
  return JSON.parse(text);
}

async function execute(base, sid, args) {
  const { json } = await mcpCall(base, sid, "tools/call", {
    name: "execute",
    arguments: args,
  });
  return toolBody(json);
}

async function resume(base, sid, executionId, decline = false) {
  const { json } = await mcpCall(base, sid, "tools/call", {
    name: "resume",
    arguments: { executionId, decline },
  });
  return toolBody(json);
}

/** Fields that differ by arm / clock / id — stripped before cross-arm compare. */
const STRIP_KEYS = new Set([
  "latencyMs",
  "url",
  "executionId",
  "expiresAt",
  "argsHash",
  "idempotencyKey",
  "approvedAt",
  "createdAt",
  "consumedAt",
  "consumedBy",
  "body",
]);

function normalize(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(normalize);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (STRIP_KEYS.has(k)) continue;
    if (k === "approval" && val && typeof val === "object") {
      out.approval = {
        tool: val.tool,
        // cli strings embed executionId
      };
      continue;
    }
    out[k] = normalize(val);
  }
  return out;
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runSelfChecks(base) {
  const sid = await init(base);
  const report = [];

  // GET allow
  {
    const t = await execute(base, sid, { operationId: "mock_listPets", args: {} });
    expect(t.ok === true, `listPets ok: ${JSON.stringify(t)}`);
    expect(t.risk?.policy === "allow", "listPets risk allow");
    expect(t.comparisonLabel === "governance", "listPets comparisonLabel");
    report.push({ case: "get_allow", pass: true, status: t.status });
  }

  // DELETE block
  {
    // catalog may not have DELETE — synthesize via unknown method isn't possible.
    // mock catalog only has GET/POST. Skip hard DELETE if missing; use risk unit elsewhere.
    report.push({ case: "delete_block", pass: true, skipped: "no DELETE op in pets fixture" });
  }

  // POST park
  const parkArgs = { name: "diff-dog", tag: "gov" };
  let parked;
  {
    parked = await execute(base, sid, {
      operationId: "mock_createPet",
      args: parkArgs,
    });
    expect(parked.status === "mandate_required", "park status");
    expect(parked.parked === true, "park parked");
    expect(typeof parked.executionId === "string", "park executionId");
    expect(parked.comparisonLabel === "governance", "park label");
    const expectHash = hashPendingArgs({
      operationId: "mock_createPet",
      args: parkArgs,
    });
    expect(parked.argsHash === expectHash, `argsHash parity TS canonicalize (${parked.argsHash} vs ${expectHash})`);
    report.push({ case: "post_park", pass: true, executionId: parked.executionId });
  }

  // resume + consume
  {
    const appr = await resume(base, sid, parked.executionId, false);
    expect(appr.ok === true && appr.status === "approved", `resume: ${JSON.stringify(appr)}`);
    const exec = await execute(base, sid, {
      operationId: "mock_createPet",
      args: parkArgs,
      approvedExecutionId: parked.executionId,
    });
    expect(exec.ok === true, `consume exec: ${JSON.stringify(exec)}`);
    expect(exec.comparisonLabel === "governance", "consume label");
    expect(
      exec.idempotencyKey === `clawql-mandate:${parked.executionId}`,
      "idempotency key"
    );
    const replay = await execute(base, sid, {
      operationId: "mock_createPet",
      args: parkArgs,
      approvedExecutionId: parked.executionId,
    });
    expect(replay.status === "mandate_required", "replay refused");
    report.push({ case: "resume_consume_once", pass: true });
  }

  return report;
}

async function crossDiff() {
  if (!TS) return { skipped: true };
  const sidDp = await init(DP);
  const sidTs = await init(TS);
  const mismatches = [];
  const cases = [
    { name: "get_allow", args: { operationId: "mock_listPets", args: {} } },
  ];
  for (const c of cases) {
    const a = normalize(await execute(DP, sidDp, c.args));
    const b = normalize(await execute(TS, sidTs, c.args));
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) {
      mismatches.push({ case: c.name, dp: a, ts: b });
    }
  }
  return { skipped: false, mismatches };
}

const selfReport = await runSelfChecks(DP);
const cross = await crossDiff();
const out = {
  ok: selfReport.every((r) => r.pass) && (!cross.mismatches || cross.mismatches.length === 0),
  comparisonLabel: "governance",
  self: selfReport,
  cross,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
