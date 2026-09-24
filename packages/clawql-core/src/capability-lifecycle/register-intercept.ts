/**
 * Register-side intercept (§3.5.1) — harness adapters MUST report here.
 * Until a concrete mechanism is chosen per harness, register interception is
 * specified but step 5 of the five-step test is not runnable.
 *
 * clawql-core decides disposition (register → routed_to_sandbox). Harness
 * claims about routing carry no authority.
 */

import { Context, Effect, Layer } from "effect";
import { WormAuditSink } from "../plugin/provider-types.js";
import { evaluateExecuteReachability } from "./execute-reachability.js";
import type { RegisterInterceptReport, ExecuteReachabilityDecision } from "./types.js";

export type RegisterInterceptOutcome = ExecuteReachabilityDecision & {
  readonly registerSideImplemented: boolean;
};

/**
 * Port harness wrappers call when their native registry/plugin loader mutates.
 * clawql-core decides routing — harness claims carry no authority.
 */
export class CapabilityRegisterIntercept extends Context.Tag("clawql/CapabilityRegisterIntercept")<
  CapabilityRegisterIntercept,
  {
    /**
     * Report a registration attempt. Returns clawql-core's decision.
     * `registerSideImplemented` is true only for *this* harnessId after markImplemented.
     */
    readonly reportRegistration: (
      report: RegisterInterceptReport
    ) => Effect.Effect<
      RegisterInterceptOutcome,
      never,
      | import("./session-catalog.js").SessionCatalogService
      | import("./promotion-store.js").PromotionStore
      | WormAuditSink
    >;
    /** Whether a specific harness (or any, if harnessId omitted) has wired register-side. */
    readonly isRegisterSideImplemented: (harnessId?: string) => Effect.Effect<boolean>;
    readonly markImplemented: (harnessId: string) => Effect.Effect<void>;
  }
>() {}

export function makeCapabilityRegisterIntercept(): Context.Tag.Service<
  typeof CapabilityRegisterIntercept
> {
  const implemented = new Set<string>();
  return {
    isRegisterSideImplemented: (harnessId) =>
      Effect.sync(() =>
        harnessId !== undefined ? implemented.has(harnessId) : implemented.size > 0
      ),
    markImplemented: (harnessId) =>
      Effect.sync(() => {
        implemented.add(harnessId);
      }),
    reportRegistration: (report) =>
      Effect.gen(function* () {
        const registerSideImplemented = implemented.has(report.harnessId);
        const decision = yield* evaluateExecuteReachability({
          sessionId: report.sessionId,
          toolName: report.toolName,
          interceptKind: "register",
        });
        return { ...decision, registerSideImplemented };
      }),
  };
}

/**
 * Default: register-side NOT implemented. Reports still evaluate the three-bucket
 * rule so invoke-equivalent denials are auditable, but step 5 remains open.
 */
export const CapabilityRegisterInterceptLive: Layer.Layer<CapabilityRegisterIntercept> = Layer.sync(
  CapabilityRegisterIntercept,
  makeCapabilityRegisterIntercept
);
