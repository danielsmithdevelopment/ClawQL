/**
 * In-memory + optional callback audit for web search/fetch provenance.
 * Regulated operators need fallback decisions recorded before the fallback runs.
 * Durable WORM is installed via {@link installWebAuditWormSink}.
 * Dual-writes domain jsonl/memory chain + process `clawql-audit` when enabled.
 */

import { appendWebEventToWormEffect } from "clawql-audit";
import { getDefaultAuditRingBuffer } from "clawql-core";
import { Effect } from "effect";
import type { WebAuditEvent, WebAuditSink } from "./audit-types.js";
import { appendWebWormEvent } from "./audit/worm.js";

export type { WebAuditEvent, WebAuditEventType, WebAuditSink } from "./audit-types.js";

const buffer: WebAuditEvent[] = [];
let sink: WebAuditSink | undefined;
let wormInstalled = false;

export function setWebAuditSink(next: WebAuditSink | undefined): void {
  sink = next;
}

export function resetWebAuditForTests(): void {
  buffer.length = 0;
  sink = undefined;
  wormInstalled = false;
}

export function listWebAuditEvents(): readonly WebAuditEvent[] {
  return [...buffer];
}

export async function appendWebAudit(
  event: Omit<WebAuditEvent, "ts"> & { ts?: string }
): Promise<WebAuditEvent> {
  const full: WebAuditEvent = {
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  };
  buffer.push(full);
  if (buffer.length > 500) buffer.shift();
  if (sink) await sink(full);
  return full;
}

/**
 * Install the default compliance sink: hash-chained WORM (memory|jsonl) +
 * mirror into the process-wide clawql-core audit ring buffer (MCP `audit` tool).
 * Idempotent — safe to call from plugin registration.
 */
export function installWebAuditWormSink(env: NodeJS.ProcessEnv = process.env): void {
  if (wormInstalled) return;
  wormInstalled = true;
  setWebAuditSink(async (event) => {
    await appendWebWormEvent(event, env);
    await Effect.runPromise(appendWebEventToWormEffect(event)).catch(() => undefined);
    try {
      getDefaultAuditRingBuffer().append({
        ts: event.ts,
        category: "web",
        action: event.type,
        summary: [event.type, event.provider, event.query ?? event.url, event.reason]
          .filter(Boolean)
          .join(" · "),
        correlationId: event.correlationId,
      });
    } catch {
      /* ring buffer optional outside MCP process */
    }
  });
}
