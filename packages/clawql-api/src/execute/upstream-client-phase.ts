/**
 * Outbound HTTP client phase timing via Node `diagnostics_channel`.
 *
 * Used under **`CLAWQL_UPSTREAM_FETCH_DIAG=1`** (or **`CLAWQL_UPSTREAM_PHASE=1`**) to split
 * ClawQL→upstream waits into:
 * - **write_delay**: ClawQL issue → `http.client.request.start` / undici sendHeaders
 * - **wire / mock**: client start → response headers (pair with mock `arrive` / `done`)
 * - **read_delay**: response headers → body consumed / `http.client.response.finish`
 *
 * node-fetch uses the `http` module channels; `CLAWQL_NATIVE_FETCH=1` uses undici.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import diagnosticsChannel from "node:diagnostics_channel";
import type { ClientRequest, IncomingMessage } from "node:http";
import { Effect } from "effect";

export type UpstreamClientPhaseSlot = {
  readonly id: number;
  readonly issueMs: number;
  readonly issueIso: string;
  readonly url: string;
  clientStartMs?: number;
  clientStartIso?: string;
  headersSentMs?: number;
  bodySentMs?: number;
  responseHeadersMs?: number;
  responseFinishMs?: number;
  socketNoDelay?: boolean | null;
  backend?: string;
};

const als = new AsyncLocalStorage<UpstreamClientPhaseSlot>();
const reqToSlot = new WeakMap<object, UpstreamClientPhaseSlot>();
let nextId = 1;
let installed = false;

export const upstreamPhaseEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const diag = ["1", "true", "yes"].includes(
      (env.CLAWQL_UPSTREAM_FETCH_DIAG ?? "").trim().toLowerCase()
    );
    const phase = ["1", "true", "yes"].includes(
      (env.CLAWQL_UPSTREAM_PHASE ?? "").trim().toLowerCase()
    );
    return diag || phase;
  });

function stamp(slot: UpstreamClientPhaseSlot, field: keyof UpstreamClientPhaseSlot, isoField?: keyof UpstreamClientPhaseSlot): void {
  const now = performance.now();
  (slot as { [k: string]: unknown })[field as string] = now;
  if (isoField) {
    (slot as { [k: string]: unknown })[isoField as string] = new Date().toISOString();
  }
}

/** Install once — safe to call from HTTP/stdio startup and from execute path. */
export const installUpstreamClientPhase = (): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (installed) return false;
    try {
      diagnosticsChannel.channel("http.client.request.start").subscribe((message: unknown) => {
        const slot = als.getStore();
        if (!slot) return;
        const req = (message as { request?: ClientRequest } | null)?.request;
        stamp(slot, "clientStartMs", "clientStartIso");
        if (req && typeof req === "object") {
          reqToSlot.set(req, slot);
          try {
            // Prefer low-latency for localhost equal-arm (diagnostic visibility).
            const sock = (req as ClientRequest & { socket?: { noDelay?: boolean } }).socket;
            if (sock && typeof sock.noDelay === "boolean") slot.socketNoDelay = sock.noDelay;
          } catch {
            /* ignore */
          }
        }
      });
      diagnosticsChannel.channel("http.client.response.finish").subscribe((message: unknown) => {
        const req = (message as { request?: object } | null)?.request;
        const slot = (req && reqToSlot.get(req)) || als.getStore();
        if (!slot) return;
        stamp(slot, "responseFinishMs");
      });
      diagnosticsChannel.channel("undici:request:create").subscribe((message: unknown) => {
        const slot = als.getStore();
        if (!slot) return;
        const req = (message as { request?: object } | null)?.request;
        stamp(slot, "clientStartMs", "clientStartIso");
        if (req && typeof req === "object") reqToSlot.set(req, slot);
      });
      diagnosticsChannel.channel("undici:client:sendHeaders").subscribe((message: unknown) => {
        const msg = message as { request?: object; socket?: { noDelay?: boolean } } | null;
        const slot =
          (msg?.request && reqToSlot.get(msg.request)) || als.getStore();
        if (!slot) return;
        stamp(slot, "headersSentMs");
        if (msg?.socket && typeof msg.socket.noDelay === "boolean") {
          slot.socketNoDelay = msg.socket.noDelay;
        }
      });
      diagnosticsChannel.channel("undici:request:bodySent").subscribe((message: unknown) => {
        const req = (message as { request?: object } | null)?.request;
        const slot = (req && reqToSlot.get(req)) || als.getStore();
        if (!slot) return;
        stamp(slot, "bodySentMs");
      });
      diagnosticsChannel.channel("undici:request:headers").subscribe((message: unknown) => {
        const req = (message as { request?: object; response?: IncomingMessage } | null)?.request;
        const slot = (req && reqToSlot.get(req)) || als.getStore();
        if (!slot) return;
        stamp(slot, "responseHeadersMs");
      });
      installed = true;
      return true;
    } catch {
      return false;
    }
  });

export const beginUpstreamClientPhase = (opts: {
  readonly url: string;
  readonly backend: string;
}): Effect.Effect<UpstreamClientPhaseSlot> =>
  Effect.gen(function* () {
    yield* installUpstreamClientPhase();
    return {
      id: nextId++,
      issueMs: performance.now(),
      issueIso: new Date().toISOString(),
      url: opts.url,
      backend: opts.backend,
    };
  });

/** Run `fn` with the phase slot in AsyncLocalStorage (sync channel hooks see it). */
export async function runWithUpstreamClientPhase<T>(
  slot: UpstreamClientPhaseSlot,
  fn: () => Promise<T>
): Promise<T> {
  return als.run(slot, fn);
}

export type UpstreamPhaseBreakdown = {
  readonly write_delay_ms: number | null;
  readonly headers_wait_ms: number | null;
  readonly body_ms: number | null;
  readonly finish_after_headers_ms: number | null;
  readonly client_start_iso: string | null;
  readonly socket_nodelay: boolean | null | undefined;
  readonly classification: "write_late" | "wire_or_mock" | "read_late" | "mixed" | "unknown";
};

/**
 * Classify a completed fetch using client-channel stamps + await boundaries.
 * `tFetch0`/`tHeaders`/`tDone` are `performance.now()` from the execute path.
 */
export const classifyUpstreamPhase = (
  slot: UpstreamClientPhaseSlot,
  opts: { readonly tFetch0: number; readonly tHeaders: number; readonly tDone: number }
): Effect.Effect<UpstreamPhaseBreakdown> =>
  Effect.sync(() => {
    const writeDelay =
      slot.clientStartMs != null ? slot.clientStartMs - slot.issueMs : null;
    const headersWait =
      slot.clientStartMs != null
        ? opts.tHeaders - slot.clientStartMs
        : opts.tHeaders - opts.tFetch0;
    const bodyMs = opts.tDone - opts.tHeaders;
    const finishAfter =
      slot.responseFinishMs != null ? slot.responseFinishMs - opts.tHeaders : null;

    let classification: UpstreamPhaseBreakdown["classification"] = "unknown";
    const total = opts.tDone - slot.issueMs;
    if (writeDelay != null && writeDelay >= 0.5 * total && writeDelay >= 20) {
      classification = "write_late";
    } else if (bodyMs >= 0.5 * total && bodyMs >= 20) {
      classification = "read_late";
    } else if (headersWait >= 0.5 * total && headersWait >= 20) {
      classification = "wire_or_mock";
    } else if (total >= 20) {
      classification = "mixed";
    }

    return {
      write_delay_ms: writeDelay,
      headers_wait_ms: headersWait,
      body_ms: bodyMs,
      finish_after_headers_ms: finishAfter,
      client_start_iso: slot.clientStartIso ?? null,
      socket_nodelay: slot.socketNoDelay,
      classification,
    };
  });

export const formatUpstreamPhaseLog = (
  slot: UpstreamClientPhaseSlot,
  breakdown: UpstreamPhaseBreakdown,
  extra: Record<string, string | number | boolean | null | undefined>
): string => {
  const parts = [
    `[clawql-upstream-phase]`,
    `class=${breakdown.classification}`,
    `write_delay_ms=${breakdown.write_delay_ms != null ? breakdown.write_delay_ms.toFixed(1) : "-"}`,
    `headers_wait_ms=${breakdown.headers_wait_ms != null ? breakdown.headers_wait_ms.toFixed(1) : "-"}`,
    `body_ms=${breakdown.body_ms != null ? breakdown.body_ms.toFixed(1) : "-"}`,
    `finish_after_headers_ms=${
      breakdown.finish_after_headers_ms != null
        ? breakdown.finish_after_headers_ms.toFixed(1)
        : "-"
    }`,
    `issue_iso=${slot.issueIso}`,
    `client_start_iso=${breakdown.client_start_iso ?? "-"}`,
    `socket_nodelay=${breakdown.socket_nodelay == null ? "-" : breakdown.socket_nodelay ? 1 : 0}`,
    `backend=${slot.backend ?? "-"}`,
    `url=${slot.url}`,
  ];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue;
    parts.push(`${k}=${v}`);
  }
  return parts.join(" ");
};
