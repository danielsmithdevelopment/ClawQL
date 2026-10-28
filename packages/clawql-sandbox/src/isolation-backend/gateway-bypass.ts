/**
 * C4 — no bypass of the ClawQL gateway from inside an isolated session.
 * Attempts (direct IP, alternate DNS, IPv6, hardcoded endpoints) must fail
 * or route through ClawQL. Recording / governance / replay depend on this.
 */

import { Effect } from "effect";
import { IsolationBackendError, IsolationBackendService } from "./interface.js";
import { DEFAULT_GATEWAY_PROBES } from "./conformance.js";
import type {
  IsolationEscapeProbe,
  IsolationEscapeProbeResult,
} from "./types.js";

export type GatewayBypassReport = {
  readonly sessionId: string;
  readonly probes: readonly IsolationEscapeProbeResult[];
  readonly allBlockedOrProxied: boolean;
  readonly failed: readonly IsolationEscapeProbeResult[];
};

/**
 * Gateway-facing probe set (subset of DEFAULT_GATEWAY_PROBES).
 * Host-file / runner / journal probes are O2 (Ontologiql); C4 focuses on API reachability.
 */
export const GATEWAY_BYPASS_PROBES: readonly IsolationEscapeProbe[] = DEFAULT_GATEWAY_PROBES.filter(
  (p) =>
    p.kind === "direct-ip" ||
    p.kind === "raw-dns" ||
    p.kind === "ipv6" ||
    p.kind === "hardcoded-endpoint"
);

export function runGatewayBypassProbesEffect(
  sessionId: string,
  probes: readonly IsolationEscapeProbe[] = GATEWAY_BYPASS_PROBES
): Effect.Effect<GatewayBypassReport, IsolationBackendError, IsolationBackendService> {
  return Effect.gen(function* () {
    const backend = yield* IsolationBackendService;
    const results = yield* backend.probeEscape(sessionId, probes);
    const failed = results.filter((r) => !r.blockedOrProxied);
    return {
      sessionId,
      probes: results,
      allBlockedOrProxied: failed.length === 0,
      failed,
    } satisfies GatewayBypassReport;
  });
}

/** Assert helper for tests / CI gates. */
export function assertNoGatewayBypassEffect(
  sessionId: string,
  probes?: readonly IsolationEscapeProbe[]
): Effect.Effect<GatewayBypassReport, IsolationBackendError, IsolationBackendService> {
  return Effect.gen(function* () {
    const report = yield* runGatewayBypassProbesEffect(sessionId, probes);
    if (!report.allBlockedOrProxied) {
      return yield* Effect.fail(
        new IsolationBackendError({
          reason: `gateway bypass detected: ${report.failed
            .map((f) => `${f.kind}:${f.target}`)
            .join(", ")}`,
        })
      );
    }
    return report;
  });
}
