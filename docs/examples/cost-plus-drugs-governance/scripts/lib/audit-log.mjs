#!/usr/bin/env node
/**
 * Ephemeral demo audit ring — analogous to MCP `audit` (in-process) plus
 * a durable JSONL file for walkthrough evidence. Not a compliance WORM store;
 * production uses clawql-audit / Merkle batch roots.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";

/**
 * @typedef {{
 *   id: string,
 *   ts: string,
 *   kind: string,
 *   actor: string,
 *   detail: Record<string, unknown>,
 *   prevHash: string | null,
 *   hash: string,
 * }} AuditEntry
 */

export class DemoAuditLog {
  /**
   * @param {{ jsonlPath?: string }} [opts]
   */
  constructor(opts = {}) {
    /** @type {AuditEntry[]} */
    this.entries = [];
    this.jsonlPath = opts.jsonlPath ?? null;
    this._prevHash = null;
  }

  /**
   * @param {string} kind
   * @param {string} actor
   * @param {Record<string, unknown>} detail
   */
  async append(kind, actor, detail) {
    const id = `aud_${randomUUID().slice(0, 8)}`;
    const ts = new Date().toISOString();
    const payload = { id, ts, kind, actor, detail, prevHash: this._prevHash };
    const hash = createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex");
    /** @type {AuditEntry} */
    const entry = { ...payload, hash: `sha256:${hash}` };
    this.entries.push(entry);
    this._prevHash = entry.hash;
    if (this.jsonlPath) {
      await mkdir(dirname(this.jsonlPath), { recursive: true });
      await appendFile(this.jsonlPath, `${JSON.stringify(entry)}\n`, "utf8");
    }
    return entry;
  }

  list() {
    return [...this.entries];
  }

  async verifyChain() {
    let prev = null;
    for (const e of this.entries) {
      if (e.prevHash !== prev) {
        return { ok: false, reason: `prevHash break at ${e.id}` };
      }
      const payload = {
        id: e.id,
        ts: e.ts,
        kind: e.kind,
        actor: e.actor,
        detail: e.detail,
        prevHash: e.prevHash,
      };
      const expect = `sha256:${createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex")}`;
      if (expect !== e.hash) {
        return { ok: false, reason: `hash mismatch at ${e.id}` };
      }
      prev = e.hash;
    }
    return { ok: true, count: this.entries.length };
  }

  async writeSummary(path) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ verified: await this.verifyChain(), entries: this.entries }, null, 2),
      "utf8"
    );
  }

  static async readJsonl(path) {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}
