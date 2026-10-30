#!/usr/bin/env node
/**
 * Live ClawQL gateway smoke for Cost Plus Drugs governance.
 *
 * Boots (or reuses) a local mock write MCP + clawql-mcp-http with:
 *   - official CPD pricing MCP (reads)
 *   - mock place_refill_order (writes → mandate → resume)
 *
 * Not medical advice. Mock orders are never sent to Cost Plus Drugs.
 *
 * Usage (from repo root, after npm ci && npm run build):
 *   node docs/examples/cost-plus-drugs-governance/scripts/gateway-smoke.mjs
 *
 * Env:
 *   CPD_GW_PORT          default 18770
 *   MOCK_WRITE_PORT      default 9892
 *   CPD_GW_KEEP=1        leave gateway + mock MCP running after success
 *   CLAWQL_HOME          isolated home (default under os.tmpdir())
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");
const exampleRoot = join(__dirname, "..");

const GW_PORT = Number(process.env.CPD_GW_PORT || 18770);
const MOCK_PORT = Number(process.env.MOCK_WRITE_PORT || 9892);
const KEEP = process.env.CPD_GW_KEEP === "1";
const home =
  process.env.CLAWQL_HOME?.trim() ||
  join(tmpdir(), `cpd-clawql-smoke-${process.pid}`);

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function log(msg) {
  console.error(`[gateway-smoke] ${msg}`);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

function parseMcpBody(text) {
  if (text.includes("data:")) {
    const m = text.match(/data:\s*(\{[\s\S]*\})/);
    if (!m) throw new Error(`SSE parse failed: ${text.slice(0, 200)}`);
    return JSON.parse(m[1]);
  }
  return text.trim() ? JSON.parse(text) : {};
}

class McpHttpClient {
  /**
   * @param {string} base
   */
  constructor(base) {
    this.base = base;
    this.sid = null;
    this.n = 0;
  }

  /**
   * @param {string} method
   * @param {unknown} [params]
   * @param {{ notify?: boolean }} [opts]
   */
  async call(method, params, opts = {}) {
    this.n += 1;
    /** @type {Record<string, unknown>} */
    const body = { jsonrpc: "2.0", method };
    if (!opts.notify) body.id = this.n;
    if (params !== undefined) body.params = params;
    /** @type {Record<string, string>} */
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sid) headers["mcp-session-id"] = this.sid;
    const res = await fetch(this.base, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sid = sid;
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    if (opts.notify) return { ok: true };
    return parseMcpBody(text);
  }

  async tool(name, args) {
    const obj = await this.call("tools/call", { name, arguments: args });
    return obj?.result?.content?.[0]?.text ?? "";
  }
}

async function waitHealth(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`health timeout: ${url}`);
}

function spawnLogged(cmd, args, env, logPath) {
  const child = spawn(cmd, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.push(child);
  /** @type {string[]} */
  const chunks = [];
  child.stderr?.on("data", (b) => {
    chunks.push(String(b));
  });
  child.on("exit", (code, signal) => {
    log(`${cmd} ${args.join(" ")} exited code=${code} signal=${signal}`);
  });
  return {
    child,
    flush: async () => {
      await writeFile(logPath, chunks.join(""), "utf8");
    },
  };
}

async function clawqlSourcesAdd(url, name) {
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [join(repoRoot, "bin/clawql.mjs"), "sources", "add", url, "--kind", "mcp", "--name", name],
      {
        cwd: repoRoot,
        env: { ...process.env, CLAWQL_HOME: home },
        stdio: "inherit",
      }
    );
    p.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`sources add failed ${code}`))));
  });
}

async function prepareHome() {
  await mkdir(home, { recursive: true });
  await clawqlSourcesAdd("https://mcp.costplusdrugs.com/", "Cost Plus Drugs Pricing");
  await clawqlSourcesAdd(`http://127.0.0.1:${MOCK_PORT}/mcp`, "CPD Mock Writes");
  const sourcesPath = join(home, "sources.json");
  const sources = JSON.parse(await (await import("node:fs/promises")).readFile(sourcesPath, "utf8"));
  for (const s of sources.sources ?? []) {
    if (s.id === "cost-plus-drugs-pricing") s.trusted = true;
  }
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  await writeFile(
    join(home, "operation-risk.json"),
    `${JSON.stringify(
      {
        version: 1,
        trustedMcpSources: ["cost-plus-drugs-pricing"],
        overrides: {
          mcp__cpd_mock_writes__place_refill_order: {
            policy: "mandate",
            level: "HIGH",
            reason: "Mock refill write — human patient approval required",
          },
          mcp__cpd_mock_writes__list_mock_orders: {
            policy: "allow",
            level: "LOW",
            reason: "Demo ledger read",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function ensureMockWrite() {
  try {
    const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/healthz`);
    if (r.ok) {
      log(`reusing mock write MCP on :${MOCK_PORT}`);
      return null;
    }
  } catch {
    /* start */
  }
  log(`starting mock write MCP on :${MOCK_PORT}`);
  return spawnLogged(
    process.execPath,
    [join(exampleRoot, "scripts/mock-pharmacy-write-mcp.mjs"), String(MOCK_PORT)],
    { MOCK_PHARMACY_WRITE_PORT: String(MOCK_PORT) },
    join(home, "mock-write.log")
  );
}

async function startGateway() {
  log(`starting clawql-mcp-http on :${GW_PORT} home=${home}`);
  const seed = [
    "search",
    "execute",
    "resume",
    "audit",
    "mcp__cost_plus_drugs_pricing__search",
    "mcp__cpd_mock_writes__place_refill_order",
    "mcp__cpd_mock_writes__list_mock_orders",
  ].join(",");
  return spawnLogged(
    process.execPath,
    [join(repoRoot, "bin/clawql-mcp-http.mjs")],
    {
      CLAWQL_HOME: home,
      CLAWQL_AUTH_MODE: "noAuth",
      CLAWQL_OPERATION_RISK_ENFORCE: "1",
      // Custom MCP bindings are process-local; SQLite LOAD=db skips reconnect.
      CLAWQL_CATALOG_SQLITE: "0",
      // Isolate mandate path; IFC=1 blocks write after CPD read (also demo-worthy).
      CLAWQL_ENABLE_SESSION_IFC: "0",
      CLAWQL_DECLINE_CELLD: "1",
      CLAWQL_DECLINE_BUN: "1",
      CLAWQL_CAPABILITY_SESSION_SEED: seed,
      PORT: String(GW_PORT),
    },
    join(home, "gateway.log")
  );
}

function cleanup() {
  if (KEEP) {
    log(`CPD_GW_KEEP=1 — leaving processes up (gateway :${GW_PORT}, home ${home})`);
    // Detach so this smoke process can exit while children keep serving.
    for (const c of children) {
      try {
        c.unref();
      } catch {
        /* ignore */
      }
    }
    return;
  }
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  // SIGTERM may dispose ClawQL API without exiting the child; force-kill shortly after.
  setTimeout(() => {
    for (const c of children) {
      try {
        if (!c.killed) c.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 1500).unref();
}

async function main() {
  log("Not medical advice. Mock orders only.");
  await prepareHome();
  const mock = await ensureMockWrite();
  await waitHealth(`http://127.0.0.1:${MOCK_PORT}/healthz`);
  const gw = await startGateway();
  await waitHealth(`http://127.0.0.1:${GW_PORT}/healthz`);
  await sleep(1000);

  const client = new McpHttpClient(`http://127.0.0.1:${GW_PORT}/mcp`);
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "cpd-gateway-smoke", version: "0.1.0" },
  });
  await client.call("notifications/initialized", undefined, { notify: true });

  const priceText = await client.tool("execute", {
    operationId: "mcp__cost_plus_drugs_pricing__search",
    args: { query: "atorvastatin 20mg" },
  });
  if (!priceText.includes("Atorvastatin")) {
    throw new Error(`price lookup failed: ${priceText.slice(0, 300)}`);
  }
  log(`price ok (${priceText.length} chars)`);

  const mandateText = await client.tool("execute", {
    operationId: "mcp__cpd_mock_writes__place_refill_order",
    args: {
      medication_name: "Atorvastatin",
      strength: "20mg",
      ndc: "00904-6291-61",
      quantity: 30,
      quoted_price_usd: 5.41,
      channel: "cpd_mail",
      patient_name: "Alex Example",
      shipping_address: "123 Demo St, Austin, TX 78701",
      rx_number: "RX-DEMO-0001",
    },
  });
  const mandate = JSON.parse(mandateText);
  if (mandate.status !== "mandate_required") {
    throw new Error(`expected mandate_required, got ${mandateText.slice(0, 400)}`);
  }
  log(`mandate parked ${mandate.executionId}`);

  const resumeText = await client.tool("resume", { executionId: mandate.executionId });
  if (!/accepted_mock|mock_ord|orderId/.test(resumeText)) {
    throw new Error(`resume failed: ${resumeText.slice(0, 400)}`);
  }
  log("resume → mock order accepted");

  const listText = await client.tool("execute", {
    operationId: "mcp__cpd_mock_writes__list_mock_orders",
    args: {},
  });
  const auditText = await client.tool("audit", { operation: "list", limit: 20 });

  const searchRes = await fetch(
    "https://api.costplusdrugs.com/pricelist/cpd/search?term=atorvastatin&strength=20mg"
  );
  const searchBytes = Buffer.byteLength(await searchRes.text(), "utf8");
  const fullBytes = 3_722_723; // measured snapshot; re-fetch in demos if needed

  const out = {
    ok: true,
    notMedicalAdvice: true,
    gateway: `http://127.0.0.1:${GW_PORT}/mcp`,
    clawqlHome: home,
    priceChars: priceText.length,
    mandate,
    resumePreview: resumeText.slice(0, 1200),
    listPreview: listText.slice(0, 600),
    auditPreview: auditText.slice(0, 800),
    compaction: {
      targetedSearchBytes: searchBytes,
      fullCpdCatalogBytesApprox: fullBytes,
      approxPayloadRatio: Number((fullBytes / Math.max(searchBytes, 1)).toFixed(1)),
    },
  };
  const outPath = join(home, "gateway-smoke-summary.json");
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, summary: outPath, gateway: out.gateway }, null, 2));

  await mock?.flush();
  await gw.flush();
  cleanup();
  // Spawned MCP children keep the event loop alive unless we exit explicitly.
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
