#!/usr/bin/env node
/**
 * Digest-bound mock refill park/approve — demo stand-in for ClawQL
 * PendingExecutionService (park → decide → atomic consume → execute).
 *
 * Agents may *stage* an order; only a human (or non-agent approver role)
 * may consume the mandate. Resume never accepts alternate args.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashPendingArgs } from "./digest.mjs";

/**
 * @typedef {'pending' | 'approved' | 'declined' | 'completed' | 'failed'} OrderStatus
 * @typedef {{
 *   executionId: string,
 *   operationId: string,
 *   args: Record<string, unknown>,
 *   argsHash: string,
 *   status: OrderStatus,
 *   createdAt: string,
 *   expiresAt: string,
 *   approvedAt: string | null,
 *   approvedBy: string | null,
 *   completedAt: string | null,
 *   result: Record<string, unknown> | null,
 *   mock: true,
 *   disclaimer: string,
 * }} PendingOrder
 */

const DISCLAIMER =
  "MOCK ORDER — no public Cost Plus Drugs ordering API; not a real prescription or shipment. Not medical advice.";

export class PendingOrderStore {
  /**
   * @param {{ dir: string, ttlHours?: number }} opts
   */
  constructor(opts) {
    this.dir = opts.dir;
    this.ttlHours = opts.ttlHours ?? 24;
  }

  /** @param {string} executionId */
  pathFor(executionId) {
    return join(this.dir, `${executionId}.json`);
  }

  /**
   * @param {{ operationId: string, args: Record<string, unknown> }} input
   * @returns {Promise<PendingOrder>}
   */
  async park(input) {
    await mkdir(this.dir, { recursive: true });
    const executionId = `pex_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const argsHash = hashPendingArgs({
      operationId: input.operationId,
      args: input.args,
    });
    const now = Date.now();
    /** @type {PendingOrder} */
    const record = {
      executionId,
      operationId: input.operationId,
      args: input.args,
      argsHash,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlHours * 3600_000).toISOString(),
      approvedAt: null,
      approvedBy: null,
      completedAt: null,
      result: null,
      mock: true,
      disclaimer: DISCLAIMER,
    };
    await writeFile(this.pathFor(executionId), JSON.stringify(record, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return record;
  }

  /** @param {string} executionId */
  async load(executionId) {
    const text = await readFile(this.pathFor(executionId), "utf8");
    return /** @type {PendingOrder} */ (JSON.parse(text));
  }

  /**
   * @param {PendingOrder} record
   */
  async save(record) {
    await writeFile(this.pathFor(record.executionId), JSON.stringify(record, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  /**
   * @param {{ executionId: string, decision: 'approve' | 'decline', actor: string, actorRole: 'human' | 'agent' }} input
   */
  async decide(input) {
    const record = await this.load(input.executionId);
    if (input.actorRole === "agent") {
      return {
        ok: false,
        code: "agent_cannot_approve",
        error:
          "Agents cannot approve their own refill mandates. A human patient/operator must resume.",
        record,
      };
    }
    if (record.status !== "pending") {
      return {
        ok: false,
        code: "not_pending",
        error: `Order status is ${record.status}`,
        record,
      };
    }
    if (Date.parse(record.expiresAt) < Date.now()) {
      return { ok: false, code: "expired", error: "Action expired", record };
    }
    const expect = hashPendingArgs({
      operationId: record.operationId,
      args: record.args,
    });
    if (expect !== record.argsHash) {
      return {
        ok: false,
        code: "digest_mismatch",
        error: "Parked args were tampered with; refuse resume",
        record,
      };
    }
    if (input.decision === "decline") {
      record.status = "declined";
      record.approvedAt = new Date().toISOString();
      record.approvedBy = input.actor;
      await this.save(record);
      return { ok: true, code: "declined", record };
    }
    record.status = "approved";
    record.approvedAt = new Date().toISOString();
    record.approvedBy = input.actor;
    await this.save(record);
    return { ok: true, code: "approved", record };
  }

  /**
   * Atomic-ish consume: only an approved mandate may execute exactly once.
   * @param {{ executionId: string, executor: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }} input
   */
  async consumeAndExecute(input) {
    const record = await this.load(input.executionId);
    if (record.status !== "approved") {
      return {
        ok: false,
        code: "not_approved",
        error: `Cannot consume status=${record.status}`,
        record,
      };
    }
    const expect = hashPendingArgs({
      operationId: record.operationId,
      args: record.args,
    });
    if (expect !== record.argsHash) {
      return {
        ok: false,
        code: "digest_mismatch",
        error: "Digest drift at consume",
        record,
      };
    }
    // Mark in-flight before side effect (demo stand-in for atomic consume).
    record.status = "completed";
    try {
      const result = await input.executor(record.args);
      record.result = { ...result, mock: true, disclaimer: DISCLAIMER };
      record.completedAt = new Date().toISOString();
      await this.save(record);
      return { ok: true, code: "completed", record };
    } catch (e) {
      record.status = "failed";
      record.result = {
        error: e instanceof Error ? e.message : String(e),
        mock: true,
      };
      record.completedAt = new Date().toISOString();
      await this.save(record);
      return { ok: false, code: "failed", record };
    }
  }
}

export { DISCLAIMER };
