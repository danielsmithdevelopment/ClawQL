#!/usr/bin/env node
/**
 * Bun vs Rust governance cross-diff on the shared Cloudflare curated catalog.
 *
 * Requires CLAWQL_TS_MCP_URL + CLAWQL_DP_MCP_URL (spawned by diff-governance-cf.sh).
 * Compares decision projection only (policy / park / block) — strips ids, latency, bodies.
 */

import { FAKE } from "./lib/fixture-ids.mjs";

const TS = process.env.CLAWQL_TS_MCP_URL?.replace(/\/$/, "");
const DP = process.env.CLAWQL_DP_MCP_URL?.replace(/\/$/, "");
const ACCEPT = "application/json, text/event-stream";

if (!TS || !DP) {
  console.error("CLAWQL_TS_MCP_URL and CLAWQL_DP_MCP_URL required");
  process.exit(2);
}

async function mcpCall(base, session, method, params) {
  const body = { jsonrpc: "2.0", id: Date.now(), method, params };
  const headers = { "content-type": "application/json", accept: ACCEPT };
  if (session) headers["mcp-session-id"] = session;
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const sid = res.headers.get("mcp-session-id") || session;
  const json = await res.json();
  if (json.error) throw new Error(`${base} RPC ${JSON.stringify(json.error)}`);
  return { sid, json };
}

async function init(base) {
  const { sid } = await mcpCall(base, null, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "diff-governance-cf", version: "0.1.0" },
  });
  if (!sid) throw new Error(`no session from ${base}`);
  return sid;
}

function toolBody(rpc) {
  const text = rpc?.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    // Bun sometimes nests differently
    const c = rpc?.result?.content;
    if (Array.isArray(c) && c[0]?.text) {
      const nested = c[0].text;
      try {
        return JSON.parse(nested);
      } catch {
        return { ok: false, error: nested, raw: nested };
      }
    }
    throw new Error(`missing tool text: ${JSON.stringify(rpc).slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text, raw: text };
  }
}

async function execute(base, sid, args) {
  const { json } = await mcpCall(base, sid, "tools/call", {
    name: "execute",
    arguments: args,
  });
  return toolBody(json);
}

/** Decision projection shared by Bun execute-core and Rust dataplane. */
function project(t) {
  if (!t || typeof t !== "object") {
    return { decision: "unknown", policy: null, parked: false, denied: false };
  }
  // Successful park: Bun omits `parked` but always returns executionId; Rust sets parked:true.
  const parkedOk =
    t.parked === true ||
    (t.status === "mandate_required" &&
      typeof t.executionId === "string" &&
      t.executionId.length > 0 &&
      !t.error);
  if (parkedOk) {
    return {
      decision: "mandate_required",
      policy: t.risk?.policy || "mandate",
      parked: true,
      denied: false,
    };
  }
  if (t.status === "mandate_required") {
    // Park attempted but store/write failed — not a green mandate decision.
    return {
      decision: "error",
      policy: t.risk?.policy || "mandate",
      parked: false,
      denied: false,
    };
  }
  if (
    t.status === "blocked" ||
    t.denied === true ||
    (typeof t.reason === "string" && /blocked/i.test(t.reason))
  ) {
    return {
      decision: "blocked",
      policy: t.risk?.policy || "block",
      parked: false,
      denied: true,
    };
  }
  if (t.ok === false && t.error) {
    return { decision: "error", policy: t.risk?.policy ?? null, parked: false, denied: false };
  }
  // Bun success is often shaped payload without ok/risk; Rust sets ok+risk.allow.
  if (t.ok === true || t.risk?.policy === "allow" || t.error === undefined) {
    return {
      decision: "ok",
      policy: t.risk?.policy || "allow",
      parked: false,
      denied: false,
    };
  }
  return {
    decision: String(t.status ?? "unknown"),
    policy: t.risk?.policy ?? null,
    parked: false,
    denied: false,
  };
}

const CASES = [
  {
    name: "get_allow",
    args: { operationId: "zones-get", args: {} },
    expect: { decision: "ok", policy: "allow", parked: false, denied: false },
  },
  {
    name: "delete_block",
    args: {
      operationId: "zones-0-delete",
      args: { zone_id: FAKE.auditZoneId },
    },
    expect: { decision: "blocked", policy: "block", parked: false, denied: true },
  },
  {
    name: "post_park",
    args: {
      operationId: "zones-post",
      args: { name: "diff-gov.example", account: { id: FAKE.accountId } },
    },
    expect: {
      decision: "mandate_required",
      policy: "mandate",
      parked: true,
      denied: false,
    },
  },
];

const sidTs = await init(TS);
const sidDp = await init(DP);
const mismatches = [];
const rows = [];

for (const c of CASES) {
  let tsBody;
  let dpBody;
  try {
    tsBody = await execute(TS, sidTs, c.args);
    dpBody = await execute(DP, sidDp, c.args);
  } catch (e) {
    mismatches.push({ case: c.name, error: String(e) });
    rows.push({ case: c.name, pass: false, error: String(e) });
    continue;
  }
  const ts = project(tsBody);
  const dp = project(dpBody);
  const pass =
    JSON.stringify(ts) === JSON.stringify(dp) &&
    JSON.stringify(ts) === JSON.stringify(c.expect);
  if (!pass) {
    mismatches.push({ case: c.name, expect: c.expect, bun: ts, rust: dp, bunRaw: tsBody, rustRaw: dpBody });
  }
  rows.push({ case: c.name, pass, bun: ts, rust: dp });
}

const out = {
  ok: mismatches.length === 0,
  comparisonLabel: "governance",
  catalog: "cloudflare-curated",
  cases: rows,
  mismatches,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
