/**
 * Load a Tempo (or demo) trace into a {@link SpanFlamegraph} for HTTP / MCP.
 */

import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";
import type { ObservabilityGovernanceSink } from "../governance/worm.js";
import { ObservabilityQueryService } from "../query/federation.js";
import type { FederatedQuerySelection } from "../query/types.js";
import {
  ObservabilityAuthError,
  type ObservabilitySessionContext,
} from "../scopes.js";
import {
  buildSpanFlamegraphEffect,
  demoSpanFlameFixtureEffect,
  parseTempoTracePayloadEffect,
  type SpanFlamegraph,
} from "./span-flame.js";

export type LoadSpanFlamegraphInput = {
  readonly session: ObservabilitySessionContext;
  readonly traceId: string;
  readonly selection?: FederatedQuerySelection;
  readonly mostSelfLimit?: number;
};

const isDemoTraceId = (traceId: string): boolean =>
  traceId === "demo" || traceId === "demo-mcp-execute";

/**
 * Resolve a span flamegraph: built-in demo fixture, or Tempo `getTrace` + parse/build.
 */
export const loadSpanFlamegraphEffect = (
  input: LoadSpanFlamegraphInput
): Effect.Effect<
  SpanFlamegraph & { readonly providerId: string | null },
  ObservabilityError | ObservabilityAuthError,
  ObservabilityQueryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    const traceId = input.traceId.trim();
    if (!traceId) {
      return yield* Effect.fail(
        new ObservabilityError({ reason: "traceId is required for span flamegraph" })
      );
    }

    if (isDemoTraceId(traceId)) {
      const graph = yield* demoSpanFlameFixtureEffect();
      return { ...graph, providerId: null };
    }

    const query = yield* ObservabilityQueryService;
    const federated = yield* query.getTrace(input.session, {
      traceId,
      selection: input.selection,
    });
    const hit = federated.results[0];
    if (!hit) {
      return yield* Effect.fail(
        new ObservabilityError({
          reason: `no trace provider returned a payload for ${traceId}`,
        })
      );
    }
    const parsed = yield* parseTempoTracePayloadEffect(hit.payload, traceId);
    const graph = yield* buildSpanFlamegraphEffect(
      parsed.traceId,
      parsed.spans,
      input.mostSelfLimit ?? 12
    );
    return { ...graph, providerId: hit.providerId };
  });

/** Public UI path (relative) for a span flamegraph. */
export const spanFlamegraphUiPathEffect = (traceId: string): Effect.Effect<string> =>
  Effect.sync(() => `/observability/flame/trace/${encodeURIComponent(traceId.trim())}`);

/** Absolute or relative UI URL using `CLAWQL_PUBLIC_ORIGIN` when set. */
export const spanFlamegraphUiUrlEffect = (
  traceId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const path = yield* spanFlamegraphUiPathEffect(traceId);
    const origin = env.CLAWQL_PUBLIC_ORIGIN?.trim().replace(/\/$/, "") ?? "";
    return origin ? `${origin}${path}` : path;
  });
