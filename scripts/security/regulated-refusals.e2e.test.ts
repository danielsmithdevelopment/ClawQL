/**
 * Audit synthesis — regulated-profile "dynamic pass" (process-level).
 *
 * Asserts CLAWQL_TIER=regulated refuses unsafe escape hatches end-to-end without
 * a kind cluster. Patterns mirror `src/composition/process-worm-host.test.ts` and
 * `packages/clawql-api/src/execute/resume-mcp-decline-only.test.ts`.
 *
 * Run: `npm run test:regulated-refusals`
 * (excluded from default `vitest run` via `*.e2e.test.ts`; see vitest.e2e.config.ts)
 *
 * Kind cluster coverage (Helm values-regulated, mesh, live MCP bind) is deferred —
 * see `scripts/security/README.md`.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import {
  loadPendingExecution,
  parkMandateExecute,
  resetPendingSqliteCacheForTests,
  resumeClawqlExecutionEffect,
} from "clawql-api";
import { assertInferenceModelAllowed } from "../../packages/clawql-inference/src/policy/local-only.js";
import {
  disposeProcessWormHostEffect,
  ensureProcessWormHostBootedEffect,
} from "../../src/composition/process-worm-host.js";
import { applyRegulatedProfileEnvEffect } from "../../src/composition/regulated-profile.js";
import { assertMcpHttpAuthBindPolicyEffect } from "../../src/http/mcp-http-auth-bind.js";
import { assertHttpGraphqlAllowedEffect } from "../../src/http/mcp-http-graphql-gate.js";
import { checkWebhookToken } from "../../src/http/webhooks/webhook-token-auth.js";

describe("regulated refusals dynamic pass (process-level)", () => {
  const saved: Record<string, string | undefined> = {};

  function remember(keys: string[]) {
    for (const k of keys) saved[k] = process.env[k];
  }

  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const k of Object.keys(saved)) delete saved[k];
  }

  afterEach(async () => {
    await Effect.runPromise(disposeProcessWormHostEffect());
    await Effect.runPromise(resetProcessWormForTests());
    resetPendingSqliteCacheForTests();
    restore();
  });

  it("1) CLAWQL_WORM_ENABLED=0 refuses to boot under regulated", async () => {
    remember(["CLAWQL_TIER", "CLAWQL_WORM_ENABLED", "CLAWQL_ALLOW_NO_ENFORCEMENT"]);
    process.env.CLAWQL_TIER = "regulated";
    process.env.CLAWQL_WORM_ENABLED = "0";
    delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;

    await expect(Effect.runPromise(ensureProcessWormHostBootedEffect(process.env))).rejects.toThrow(
      /regulated.*WORM disabled/i
    );
  });

  it("2) MCP resume with approve fails (decline-only)", async () => {
    remember([
      "CLAWQL_TIER",
      "CLAWQL_HOME",
      "CLAWQL_PENDING_STORE",
      "CLAWQL_OPERATION_RISK_ENFORCE",
      "CLAWQL_WORM_ENABLED",
      "CLAWQL_WORM_LOCAL",
      "CLAWQL_WORM_REMOTE",
    ]);
    const home = await mkdtemp(join(tmpdir(), "clawql-regulated-resume-"));
    // Park with memory dual-ack (regulated refuses memory WORM — covered in test 1 /
    // env-config). Decline-only is channel policy; re-assert under CLAWQL_TIER=regulated
    // at resume time without needing S3 Object Lock in CI.
    delete process.env.CLAWQL_TIER;
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";

    resetPendingSqliteCacheForTests();
    await Effect.runPromise(bootProcessWormFromEnvEffect());

    const parked = await parkMandateExecute({
      operationId: "patchItem",
      args: { id: "1" },
      risk: {
        level: "HIGH",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP PATCH",
      },
      home,
    });

    process.env.CLAWQL_TIER = "regulated";

    const content = await Effect.runPromise(
      resumeClawqlExecutionEffect({
        executionId: parked.executionId,
        decision: "approve",
        channel: "mcp",
        approvedBy: { kind: "operator", id: "forged" },
        home,
      })
    );
    const json = JSON.parse(content[0]!.text) as { ok?: boolean; error?: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/decline-only|cannot self-approve/i);

    const still = await loadPendingExecution(parked.executionId, home);
    expect(still?.status).toBe("pending");
  });

  it("3) noAuth on non-loopback refuses (regulated refuses noAuth entirely)", async () => {
    await expect(
      Effect.runPromise(
        assertMcpHttpAuthBindPolicyEffect({
          listenHost: "0.0.0.0",
          authMode: "noAuth",
          env: {
            CLAWQL_TIER: "regulated",
            CLAWQL_ALLOW_UNAUTHENTICATED: "1",
          },
        })
      )
    ).rejects.toThrow(/regulated.*noAuth/i);

    await expect(
      Effect.runPromise(
        assertMcpHttpAuthBindPolicyEffect({
          listenHost: "127.0.0.1",
          authMode: "noAuth",
          env: { CLAWQL_TIER: "regulated" },
        })
      )
    ).rejects.toThrow(/regulated.*noAuth/i);
  });

  it("4a) GraphQL opt-in refused under regulated", async () => {
    await expect(
      Effect.runPromise(
        assertHttpGraphqlAllowedEffect({
          CLAWQL_TIER: "regulated",
          CLAWQL_HTTP_GRAPHQL: "1",
        })
      )
    ).rejects.toThrow(/CLAWQL_HTTP_GRAPHQL.*regulated/i);
  });

  it("4b) webhook without token refused (503)", () => {
    remember(["CLAWQL_TIER", "CLAWQL_HITL_WEBHOOK_TOKEN", "CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED"]);
    process.env.CLAWQL_TIER = "regulated";
    delete process.env.CLAWQL_HITL_WEBHOOK_TOKEN;
    delete process.env.CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED;

    const result = checkWebhookToken({
      expectedEnvName: "CLAWQL_HITL_WEBHOOK_TOKEN",
      presented: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toMatch(/CLAWQL_HITL_WEBHOOK_TOKEN/);
    }
  });

  it("4c) inference local-only refuses remote models after regulated profile", async () => {
    remember([
      "CLAWQL_TIER",
      "CLAWQL_ALLOW_NO_ENFORCEMENT",
      "CLAWQL_SANDBOX_BACKEND",
      "CLAWQL_INFERENCE_LOCAL_ONLY",
      "CLAWQL_INFERENCE_KEYS_ENABLED",
      "CLAWQL_PANGUARD_PROXY_PLUGIN",
      "CLAWQL_PANGUARD_IN_PROCESS",
      "CLAWQL_ENABLE_SESSION_IFC",
      "CLAWQL_OPERATION_RISK_ENFORCE",
      "CLAWQL_WORM_REQUIRED",
    ]);
    process.env.CLAWQL_TIER = "regulated";
    delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;
    delete process.env.CLAWQL_SANDBOX_BACKEND;
    delete process.env.CLAWQL_INFERENCE_LOCAL_ONLY;

    await Effect.runPromise(applyRegulatedProfileEnvEffect(process.env));
    expect(process.env.CLAWQL_INFERENCE_LOCAL_ONLY).toBe("1");

    expect(() => assertInferenceModelAllowed("openai/gpt-4o", process.env)).toThrow(/local-only/);
    expect(() => assertInferenceModelAllowed("ollama/phi4", process.env)).not.toThrow();
  });
});
