/**
 * Register-side intercept (§3.5.1) — harness adapters MUST report here.
 * Until a concrete mechanism is chosen per harness, register interception is
 * specified but step 5 of the five-step test is not runnable.
 */

import { Context, Effect, Layer, Ref } from "effect";
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
     * `registerSideImplemented` is true only when a real harness adapter is wired.
     */
    readonly reportRegistration: (
      report: RegisterInterceptReport,
      opts?: { readonly routeToSandbox?: boolean }
    ) => Effect.Effect<
      RegisterInterceptOutcome,
      never,
      | import("./session-catalog.js").SessionCatalogService
      | import("./promotion-store.js").PromotionStore
      | WormAuditSink
    >;
    /** Whether any harness has wired a real register-side mechanism. */
    readonly isRegisterSideImplemented: () => Effect.Effect<boolean>;
    readonly markImplemented: (harnessId: string) => Effect.Effect<void>;
  }
>() {}

/**
 * Default: register-side NOT implemented. Reports still evaluate the three-bucket
 * rule so invoke-equivalent denials are auditable, but step 5 remains open.
 */
export const CapabilityRegisterInterceptLive: Layer.Layer<CapabilityRegisterIntercept> =
  Layer.effect(
    CapabilityRegisterIntercept,
    Effect.gen(function* () {
      const implemented = yield* Ref.make(new Set<string>());
      return {
        isRegisterSideImplemented: () =>
          Effect.gen(function* () {
            const s = yield* Ref.get(implemented);
            return s.size > 0;
          }),
        markImplemented: (harnessId) =>
          Ref.update(implemented, (s) => {
            const next = new Set(s);
            next.add(harnessId);
            return next;
          }),
        reportRegistration: (report, opts) =>
          Effect.gen(function* () {
            const s = yield* Ref.get(implemented);
            const registerSideImplemented = s.has(report.harnessId) || s.size > 0;
            const decision = yield* evaluateExecuteReachability({
              sessionId: report.sessionId,
              toolName: report.toolName,
              interceptKind: "register",
              dispositionIfDenied: opts?.routeToSandbox ? "routed_to_sandbox" : "denied",
            });
            return { ...decision, registerSideImplemented };
          }),
      };
    })
  );
