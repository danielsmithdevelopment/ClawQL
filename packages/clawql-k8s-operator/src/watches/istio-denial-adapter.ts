/**
 * Istio ambient denial telemetry → BurstWatchStub `mesh_denial` (§8 denial bridging).
 *
 * Parses Envoy/ztunnel-shaped JSON access-log lines (or NDJSON streams) into
 * MeshDenialEvent. Does not auto-generate AuthorizationPolicy — read-only bridge.
 */

import { Context, Effect, Layer } from "effect";
import type { MeshDenialEvent } from "../session-placement.js";
import type { WatchEvent } from "./burst-watch-stub.js";
import type { BurstWatchStub } from "./burst-watch-stub.js";

export type IstioAccessLogRecord = {
  readonly response_code?: number | string;
  readonly response_flags?: string;
  readonly response_code_details?: string;
  readonly authority?: string;
  readonly path?: string;
  readonly method?: string;
  readonly upstream_cluster?: string;
  readonly requested_server_name?: string;
  readonly protocol?: string;
  readonly duration?: number;
  /** Envoy often flattens principals as dotted keys. */
  readonly "source.principal"?: string;
  readonly "destination.principal"?: string;
  readonly source_principal?: string;
  readonly destination_principal?: string;
  readonly connection_termination_details?: string;
  /** Optional ClawQL correlation header mirror. */
  readonly session_id?: string;
  readonly "x-clawql-session-id"?: string;
  readonly request_id?: string;
  readonly "x-request-id"?: string;
  /** Hint: "ztunnel" | "waypoint" | envoy filter chain name. */
  readonly reporter?: string;
  readonly filter_chain_name?: string;
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/** True when the access-log line represents a mesh policy denial. */
export function isIstioDenialRecord(rec: IstioAccessLogRecord): boolean {
  const code = num(rec.response_code);
  if (code === 403) return true;
  const flags = (rec.response_flags ?? "").toUpperCase();
  if (flags.includes("RBAC") || flags.includes("UAEX")) return true;
  const details = (rec.response_code_details ?? "").toLowerCase();
  if (details.includes("rbac_access_denied") || details.includes("denied")) return true;
  const term = (rec.connection_termination_details ?? "").toLowerCase();
  return term.includes("denied") || term.includes("rbac");
}

function inferLayer(rec: IstioAccessLogRecord): MeshDenialEvent["layer"] {
  const hint =
    `${rec.reporter ?? ""} ${rec.filter_chain_name ?? ""} ${rec.upstream_cluster ?? ""}`.toLowerCase();
  if (hint.includes("ztunnel")) return "ztunnel";
  if (hint.includes("waypoint") || hint.includes("inbound|")) return "waypoint";
  // L4-only denials without HTTP attrs → ztunnel; HTTP path/method present → waypoint.
  if (!rec.path && !rec.method) return "ztunnel";
  return "waypoint";
}

/**
 * Map one Istio/Envoy access-log object to MeshDenialEvent, or null if not a denial.
 */
export function meshDenialFromIstioRecord(
  rec: IstioAccessLogRecord
): Effect.Effect<MeshDenialEvent | null> {
  return Effect.sync(() => {
    if (!isIstioDenialRecord(rec)) return null;
    const source = str(rec["source.principal"]) ?? str(rec.source_principal) ?? "unknown-source";
    const destination =
      str(rec["destination.principal"]) ??
      str(rec.destination_principal) ??
      str(rec.authority) ??
      str(rec.requested_server_name) ??
      str(rec.upstream_cluster) ??
      "unknown-destination";
    const requestId =
      str(rec.request_id) ?? str(rec["x-request-id"]) ?? `istio:${source}->${destination}`;
    const reason =
      str(rec.response_code_details) ??
      str(rec.response_flags) ??
      str(rec.connection_termination_details) ??
      `http_${rec.response_code ?? "deny"}`;
    const sessionId = str(rec.session_id) ?? str(rec["x-clawql-session-id"]);
    return {
      requestId,
      sourceIdentity: source,
      destination,
      layer: inferLayer(rec),
      reason,
      ...(sessionId ? { sessionId } : {}),
    } satisfies MeshDenialEvent;
  });
}

/** Parse a single JSON or NDJSON line into a mesh_denial WatchEvent when applicable. */
export function watchEventFromIstioAccessLogLine(
  line: string
): Effect.Effect<
  WatchEvent | null,
  { readonly _tag: "IstioLogParseError"; readonly reason: string }
> {
  return Effect.gen(function* () {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return yield* Effect.fail({
        _tag: "IstioLogParseError" as const,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    if (!asRecord(parsed)) {
      return yield* Effect.fail({
        _tag: "IstioLogParseError" as const,
        reason: "access-log line is not a JSON object",
      });
    }
    const denial = yield* meshDenialFromIstioRecord(parsed as IstioAccessLogRecord);
    if (!denial) return null;
    return { kind: "mesh_denial" as const, event: denial };
  });
}

export class IstioDenialWatchService extends Context.Tag("clawql/IstioDenialWatchService")<
  IstioDenialWatchService,
  {
    readonly ingestLine: (
      line: string
    ) => Effect.Effect<
      WatchEvent | null,
      { readonly _tag: "IstioLogParseError"; readonly reason: string }
    >;
    readonly ingestNdjson: (body: string) => Effect.Effect<{
      readonly events: readonly WatchEvent[];
      readonly parseErrors: number;
      readonly skippedNonDenials: number;
    }>;
  }
>() {}

export function makeIstioDenialWatchService(): Context.Tag.Service<typeof IstioDenialWatchService> {
  return {
    ingestLine: (line) => watchEventFromIstioAccessLogLine(line),
    ingestNdjson: (body) =>
      Effect.gen(function* () {
        const events: WatchEvent[] = [];
        let parseErrors = 0;
        let skippedNonDenials = 0;
        for (const line of body.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const result = yield* watchEventFromIstioAccessLogLine(line).pipe(Effect.either);
          if (result._tag === "Left") {
            parseErrors += 1;
            continue;
          }
          if (result.right === null) {
            skippedNonDenials += 1;
            continue;
          }
          events.push(result.right);
        }
        return { events, parseErrors, skippedNonDenials };
      }),
  };
}

export const IstioDenialWatchLive: Layer.Layer<IstioDenialWatchService> = Layer.succeed(
  IstioDenialWatchService,
  makeIstioDenialWatchService()
);

/** Push parsed denials onto BurstWatchStub. */
export function enqueueIstioNdjsonToStub(
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  body: string
): Effect.Effect<
  { readonly enqueued: number; readonly parseErrors: number; readonly skippedNonDenials: number },
  never,
  IstioDenialWatchService
> {
  return Effect.gen(function* () {
    const svc = yield* IstioDenialWatchService;
    const { events, parseErrors, skippedNonDenials } = yield* svc.ingestNdjson(body);
    for (const ev of events) {
      yield* stub.enqueue(ev);
    }
    return { enqueued: events.length, parseErrors, skippedNonDenials };
  });
}
