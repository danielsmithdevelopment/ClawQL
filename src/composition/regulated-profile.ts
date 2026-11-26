/**
 * Regulated-tier composition (audit 3.05): fail-closed Panguard, parked destructive
 * writes, session IFC/taint; refuse ALLOW_NO_ENFORCEMENT and Cloudflare sandbox bridge.
 *
 * Call once at process start before composing plugins / accepting traffic.
 */

import { Effect } from "effect";

export type RegulatedControlsSnapshot = {
  readonly tier: "regulated";
  readonly panguardProxyPlugin: boolean;
  readonly panguardInProcess: boolean;
  readonly allowNoEnforcement: boolean;
  readonly operationRiskEnforce: boolean;
  readonly sessionIfc: boolean;
  readonly sandboxBackend: string;
};

function envTruthy(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Mutates `env` in place with regulated defaults and refuses incompatible settings.
 */
export function applyRegulatedProfileEnvEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<RegulatedControlsSnapshot, Error> {
  return Effect.gen(function* () {
    const tier = env.CLAWQL_TIER?.trim().toLowerCase();
    if (tier !== "regulated") {
      return yield* Effect.fail(
        new Error("applyRegulatedProfileEnvEffect requires CLAWQL_TIER=regulated")
      );
    }

    if (envTruthy(env, "CLAWQL_ALLOW_NO_ENFORCEMENT")) {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_TIER=regulated refuses CLAWQL_ALLOW_NO_ENFORCEMENT=1. " +
            "Install blocking enforcement (Panguard) or leave the regulated profile."
        )
      );
    }

    if (envTruthy(env, "CLAWQL_SOURCES_ALLOW_HTTP")) {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_TIER=regulated refuses CLAWQL_SOURCES_ALLOW_HTTP=1. " +
            "Custom sources must use HTTPS under the regulated profile."
        )
      );
    }

    const sandbox = env.CLAWQL_SANDBOX_BACKEND?.trim().toLowerCase();
    if (sandbox === "bridge" || sandbox === "cloudflare") {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_TIER=regulated refuses CLAWQL_SANDBOX_BACKEND=bridge. " +
            "Use auto|docker|macos-seatbelt|kata|agent-substrate."
        )
      );
    }

    // Force fail-closed controls under regulated (do not honor prior opt-outs).
    env.CLAWQL_PANGUARD_PROXY_PLUGIN = "1";
    env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    env.CLAWQL_ENABLE_SESSION_IFC = "1";
    env.CLAWQL_WORM_REQUIRED = "1";
    // Audit 6.06: inference stays on local providers unless allowlisted.
    env.CLAWQL_INFERENCE_LOCAL_ONLY = "1";
    // Audit 6.03: inference HTTP requires virtual keys under regulated.
    env.CLAWQL_INFERENCE_KEYS_ENABLED = "1";
    if (!env.CLAWQL_SANDBOX_BACKEND?.trim()) {
      env.CLAWQL_SANDBOX_BACKEND = "auto";
    }

    const snapshot: RegulatedControlsSnapshot = {
      tier: "regulated",
      panguardProxyPlugin: envTruthy(env, "CLAWQL_PANGUARD_PROXY_PLUGIN"),
      panguardInProcess: envTruthy(env, "CLAWQL_PANGUARD_IN_PROCESS"),
      allowNoEnforcement: false,
      operationRiskEnforce: envTruthy(env, "CLAWQL_OPERATION_RISK_ENFORCE"),
      sessionIfc: envTruthy(env, "CLAWQL_ENABLE_SESSION_IFC"),
      sandboxBackend: env.CLAWQL_SANDBOX_BACKEND?.trim() || "auto",
    };

    process.stderr.write(
      `[clawql] regulated profile controls: panguard_proxy=${snapshot.panguardProxyPlugin} ` +
        `panguard_in_process=${snapshot.panguardInProcess} ` +
        `operation_risk_enforce=${snapshot.operationRiskEnforce} ` +
        `session_ifc=${snapshot.sessionIfc} ` +
        `sandbox_backend=${snapshot.sandboxBackend} ` +
        `allow_no_enforcement=false worm_required=true\n`
    );

    return snapshot;
  });
}

export function applyRegulatedProfileEnvIfNeeded(
  env: NodeJS.ProcessEnv = process.env
): RegulatedControlsSnapshot | null {
  if (env.CLAWQL_TIER?.trim().toLowerCase() !== "regulated") return null;
  return Effect.runSync(applyRegulatedProfileEnvEffect(env));
}
