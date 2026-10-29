#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPendingArgs } from "../scripts/lib/digest.mjs";
import { DemoAuditLog } from "../scripts/lib/audit-log.mjs";
import { loadBaaPolicy, gatePayloadForProvider } from "../scripts/lib/baa-policy.mjs";
import { PendingOrderStore } from "../scripts/lib/pending-orders.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("digest binding", () => {
  it("is stable for key order and detects arg drift", () => {
    const a = hashPendingArgs({
      operationId: "mcp/cpd-mock-writes/place_refill_order",
      args: { ndc: "1", quantity: 30, quoted_price_usd: 5.41 },
    });
    const b = hashPendingArgs({
      operationId: "mcp/cpd-mock-writes/place_refill_order",
      args: { quoted_price_usd: 5.41, quantity: 30, ndc: "1" },
    });
    assert.equal(a, b);
    const c = hashPendingArgs({
      operationId: "mcp/cpd-mock-writes/place_refill_order",
      args: { ndc: "1", quantity: 90, quoted_price_usd: 5.41 },
    });
    assert.notEqual(a, c);
  });
});

describe("BAA routing", () => {
  it("redacts PHI for non-BAA providers and keeps it for BAA providers", async () => {
    const policy = await loadBaaPolicy(join(root, "baa-routing.example.yaml"));
    const payload = {
      medication_name: "Atorvastatin",
      quoted_price_usd: 5.41,
      patient_name: "Alex Example",
      shipping_address: "123 Demo St",
    };
    const grok = gatePayloadForProvider(policy, "xai-grok", payload);
    assert.deepEqual(grok.redactedFields.sort(), ["patient_name", "shipping_address"]);
    assert.equal(grok.payload.patient_name, "[REDACTED_NO_BAA]");
    assert.equal(grok.payload.medication_name, "Atorvastatin");

    const claude = gatePayloadForProvider(policy, "anthropic-claude-baa", payload);
    assert.equal(claude.baa, true);
    assert.equal(claude.redactedFields.length, 0);
    assert.equal(claude.payload.patient_name, "Alex Example");
  });
});

describe("mandate park / resume", () => {
  it("blocks agent approve and binds human consume to digest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cpd-gov-"));
    try {
      const store = new PendingOrderStore({ dir });
      const args = {
        medication_name: "Atorvastatin",
        strength: "20mg",
        ndc: "00904-6291-61",
        quantity: 30,
        quoted_price_usd: 5.41,
        channel: "cpd_mail",
        patient_name: "Alex Example",
      };
      const parked = await store.park({
        operationId: "mcp/cpd-mock-writes/place_refill_order",
        args,
      });
      assert.equal(parked.status, "pending");
      assert.match(parked.argsHash, /^sha256:[a-f0-9]{64}$/);

      const agent = await store.decide({
        executionId: parked.executionId,
        decision: "approve",
        actor: "agent:x",
        actorRole: "agent",
      });
      assert.equal(agent.ok, false);
      assert.equal(agent.code, "agent_cannot_approve");

      const human = await store.decide({
        executionId: parked.executionId,
        decision: "approve",
        actor: "patient:alex",
        actorRole: "human",
      });
      assert.equal(human.ok, true);

      const done = await store.consumeAndExecute({
        executionId: parked.executionId,
        executor: async (a) => ({ orderId: "mock_ord_test", echoed_qty: a.quantity }),
      });
      assert.equal(done.ok, true);
      assert.equal(done.record.result?.echoed_qty, 30);
      assert.equal(done.record.result?.mock, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("audit chain", () => {
  it("verifies hash linkage", async () => {
    const audit = new DemoAuditLog();
    await audit.append("A", "sys", { n: 1 });
    await audit.append("B", "sys", { n: 2 });
    const v = await audit.verifyChain();
    assert.equal(v.ok, true);
    assert.equal(v.count, 2);
  });
});
