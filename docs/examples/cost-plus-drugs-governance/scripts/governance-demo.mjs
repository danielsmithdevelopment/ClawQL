#!/usr/bin/env node
/**
 * Cost Plus Drugs × ClawQL governance walkthrough (offline-capable).
 *
 * Story:
 *   1. Read public cash price (fixture or live API — not medical advice).
 *   2. Gate mock patient fields by BAA provider policy (Grok vs BAA model).
 *   3. Agent stages refill → mandate_required (digest-bound).
 *   4. Agent cannot approve itself.
 *   5. Human approves exact drug/qty/price → mock write + hash-chained audit.
 *
 * Usage:
 *   node scripts/governance-demo.mjs
 *   CPD_LIVE_PRICE=1 node scripts/governance-demo.mjs   # hit public API
 *   DEMO_DATA_DIR=/tmp/cpd-demo node scripts/governance-demo.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoAuditLog } from "./lib/audit-log.mjs";
import { loadBaaPolicy, gatePayloadForProvider } from "./lib/baa-policy.mjs";
import { PendingOrderStore, DISCLAIMER } from "./lib/pending-orders.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = process.env.DEMO_DATA_DIR || join(root, ".demo-data");
const outDir = join(dataDir, "out");

const OPERATION_ID = "mcp/cpd-mock-writes/place_refill_order";

async function loadPrice() {
  if (process.env.CPD_LIVE_PRICE === "1") {
    const url =
      "https://api.costplusdrugs.com/pricelist/cpd/search?term=atorvastatin&strength=20mg";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`live price HTTP ${res.status}`);
    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : [];
    const first = items[0];
    if (!first) throw new Error("live price returned no rows");
    const ch = first.cpd_channel || {};
    return {
      live: true,
      source: url,
      medication_name: first.medication_name,
      brand_name: first.brand_name,
      strength: first.strength,
      ndc: (first.equivalent_ndcs || [])[0] || "unknown",
      quantity: Number(ch.sample_pack_size || first.sample_pack_size || 30),
      quoted_price_usd: Number(
        ch.sample_pack_price_total_to_patient_without_shipping ||
          ch.sample_pack_price ||
          0
      ),
      channel: "cpd_mail",
      product_url: first.url,
    };
  }
  const fixture = JSON.parse(
    await readFile(join(root, "fixtures/atorvastatin-search.json"), "utf8")
  );
  const first = fixture.results[0];
  const ch = first.cpd_channel;
  return {
    live: false,
    source: fixture.source,
    medication_name: first.medication_name,
    brand_name: first.brand_name,
    strength: first.strength,
    ndc: first.equivalent_ndcs[0],
    quantity: Number(ch.sample_pack_size || 30),
    quoted_price_usd: Number(ch.sample_pack_price_total_to_patient_without_shipping),
    channel: "cpd_mail",
    product_url: first.url,
  };
}

async function mockUpstreamPlaceOrder(args) {
  // Stand-in for tools/call on mock-pharmacy-write-mcp (no network required).
  return {
    orderId: `mock_ord_${Date.now().toString(36)}`,
    status: "accepted_mock",
    bound: {
      medication_name: args.medication_name,
      strength: args.strength,
      ndc: args.ndc,
      quantity: args.quantity,
      quoted_price_usd: args.quoted_price_usd,
      channel: args.channel,
    },
  };
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const audit = new DemoAuditLog({ jsonlPath: join(outDir, "audit.jsonl") });
  const store = new PendingOrderStore({ dir: join(dataDir, "pending-orders") });
  const baa = await loadBaaPolicy(join(root, "baa-routing.example.yaml"));

  console.log("=== Cost Plus Drugs × ClawQL governance demo ===");
  console.log("Disclaimer: pricing + MOCK orders only. Not medical advice.\n");

  // 1) Public price read
  const price = await loadPrice();
  await audit.append("PRICE_LOOKUP", "system", {
    live: price.live,
    source: price.source,
    medication_name: price.medication_name,
    strength: price.strength,
    quoted_price_usd: price.quoted_price_usd,
  });
  console.log(
    `1. Price (${price.live ? "LIVE" : "fixture"}): ${price.medication_name} ${price.strength}` +
      ` → $${price.quoted_price_usd} cash (${price.quantity} ct, before shipping)`
  );

  // 2) Multi-model BAA gate on the *same* refill intent
  const refillIntent = {
    medication_name: price.medication_name,
    strength: price.strength,
    ndc: price.ndc,
    quantity: price.quantity,
    quoted_price_usd: price.quoted_price_usd,
    channel: price.channel,
    patient_name: "Alex Example",
    shipping_address: "123 Demo St, Austin, TX 78701",
    rx_number: "RX-DEMO-0001",
  };

  const grokView = gatePayloadForProvider(baa, "xai-grok", refillIntent);
  const claudeView = gatePayloadForProvider(baa, "anthropic-claude-baa", refillIntent);
  await audit.append("BAA_ROUTE", "gateway", {
    grok_redacted: grokView.redactedFields,
    claude_baa: claudeView.baa,
  });
  console.log(
    `2. BAA routing: Grok redacts [${grokView.redactedFields.join(", ")}];` +
      ` Claude-BAA provider retains patient fields (${claudeView.baa ? "baa=true" : "baa=false"})`
  );
  if (grokView.redactedFields.length < 2) {
    fail("expected Grok path to redact PHI fields");
  }
  if (!claudeView.baa || claudeView.redactedFields.length !== 0) {
    fail("expected Claude-BAA path to keep PHI");
  }

  // 3) Agent stages mandate (uses full args server-side; models may only see gated views)
  const parked = await store.park({
    operationId: OPERATION_ID,
    args: refillIntent,
  });
  await audit.append("HUMAN_DECISION_REQUESTED", "agent:demo-llm", {
    executionId: parked.executionId,
    argsHash: parked.argsHash,
    operationId: parked.operationId,
    bound: {
      medication_name: refillIntent.medication_name,
      strength: refillIntent.strength,
      ndc: refillIntent.ndc,
      quantity: refillIntent.quantity,
      quoted_price_usd: refillIntent.quoted_price_usd,
    },
  });
  console.log(
    `3. Agent execute → mandate_required\n` +
      `   executionId=${parked.executionId}\n` +
      `   argsHash=${parked.argsHash}`
  );

  // 4) Agent tries to self-approve
  const agentTry = await store.decide({
    executionId: parked.executionId,
    decision: "approve",
    actor: "agent:demo-llm",
    actorRole: "agent",
  });
  await audit.append("AGENT_APPROVE_BLOCKED", "agent:demo-llm", {
    executionId: parked.executionId,
    code: agentTry.code,
  });
  console.log(`4. Agent self-approve → blocked (${agentTry.code})`);
  if (agentTry.ok) fail("agent must not approve");

  // 5) Human approves exact digest and consume
  const human = await store.decide({
    executionId: parked.executionId,
    decision: "approve",
    actor: "patient:alex-example",
    actorRole: "human",
  });
  if (!human.ok) fail(`human approve failed: ${human.error}`);
  await audit.append("HUMAN_APPROVAL", "patient:alex-example", {
    executionId: parked.executionId,
    argsHash: parked.argsHash,
  });

  const done = await store.consumeAndExecute({
    executionId: parked.executionId,
    executor: mockUpstreamPlaceOrder,
  });
  if (!done.ok) fail(`consume failed: ${done.code}`);
  await audit.append("MANDATE_FINALIZED", "gateway", {
    executionId: parked.executionId,
    orderId: done.record.result?.orderId,
    status: done.record.status,
  });
  console.log(
    `5. Human approved → mock order ${done.record.result?.orderId} (${done.record.status})`
  );
  console.log(`   ${DISCLAIMER}`);

  const verified = await audit.verifyChain();
  if (!verified.ok) fail(`audit chain broken: ${verified.reason}`);
  await audit.writeSummary(join(outDir, "audit-summary.json"));

  const summary = {
    ok: true,
    disclaimer: DISCLAIMER,
    notMedicalAdvice: true,
    price,
    baa: {
      grokRedactedFields: grokView.redactedFields,
      claudeRetainsPhi: claudeView.baa,
    },
    mandate: {
      executionId: parked.executionId,
      argsHash: parked.argsHash,
      agentSelfApprove: agentTry.code,
      finalStatus: done.record.status,
      mockOrderId: done.record.result?.orderId,
    },
    audit: verified,
    pitch:
      "You've built the read side (mcp.costplusdrugs.com). Here's how agents can safely stage orders across models — patient approval bound to exact drug/qty/price, PHI only to BAA providers, full audit trail.",
  };
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log("\n=== OK ===");
  console.log(`Wrote ${join(outDir, "summary.json")}`);
  console.log(`Audit entries: ${verified.count} (chain ok)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
