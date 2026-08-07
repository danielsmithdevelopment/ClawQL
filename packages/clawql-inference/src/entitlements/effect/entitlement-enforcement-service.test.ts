import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentsEffectRuntimeForTests } from "clawql-payments/plugin";
import { AchTopupService, createUsageStore, CreditsLedgerService } from "clawql-payments";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import { InferenceGatewayService } from "../../fallback/effect/inference-gateway-service.js";
import { EntitlementLimitError } from "../errors.js";
import {
  EntitlementEnforcementService,
  entitlementEnforcementLiveLayer,
} from "./entitlement-enforcement-service.js";
import { paymentsServicesLiveLayer } from "clawql-payments/plugin";

class StubGateway implements InferenceGateway {
  readonly calls: InferenceRequest[] = [];

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    this.calls.push(request);
    return {
      content: "ok",
      model: request.model ?? "stub/model",
      correlationId: request.correlationId,
    };
  }
}

function stubGatewayLayer(inner: InferenceGateway) {
  return Layer.succeed(
    InferenceGatewayService,
    InferenceGatewayService.of({
      complete: (request) =>
        Effect.tryPromise({
          try: () => inner.complete(request),
          catch: (cause) => cause,
        }),
    })
  );
}

describe("EntitlementEnforcementService", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    home = await mkdtemp(join(tmpdir(), "clawql-inference-entitlements-effect-"));
    env = {
      ...process.env,
      CLAWQL_HOME: home,
      CLAWQL_PAYMENTS_ENFORCE_INFERENCE: "1",
    };
    await mkdir(join(home, "Payments"), { recursive: true });
    await writeFile(
      join(home, "Payments", "payments.json"),
      `${JSON.stringify({ plan: "free", tenantId: "default" }, null, 2)}\n`
    );
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    await rm(home, { recursive: true, force: true });
  });

  function makeLayer(inner: InferenceGateway) {
    return entitlementEnforcementLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(stubGatewayLayer(inner), paymentsServicesLiveLayer(env)))
    );
  }

  it("allows completions under the monthly inference limit", async () => {
    const inner = new StubGateway();
    const layer = makeLayer(inner);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const enforcement = yield* EntitlementEnforcementService;
        return yield* enforcement.completeWithEnforcement({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.content).toBe("ok");
    expect(inner.calls).toHaveLength(1);
  });

  it(
    "blocks completions when the monthly inference limit is reached",
    { timeout: 15_000 },
    async () => {
      const usageStore = createUsageStore(env);
      for (let i = 0; i < 100; i++) {
        await usageStore.increment("default", "inference_calls", 1, "free");
      }

      const inner = new StubGateway();
      const layer = makeLayer(inner);

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const enforcement = yield* EntitlementEnforcementService;
          return yield* enforcement.completeWithEnforcement({
            model: "openai/gpt-4o",
            messages: [{ role: "user", content: "blocked" }],
          });
        }).pipe(Effect.provide(layer))
      );

      expect(exit._tag).toBe("Failure");
      expect(inner.calls).toHaveLength(0);
      if (exit._tag === "Failure") {
        const { Cause } = await import("effect");
        const err = Cause.squash(exit.cause);
        expect(err).toBeInstanceOf(EntitlementLimitError);
      }
    }
  );

  it("uses virtual key team as tenant id for usage", async () => {
    const inner = new StubGateway();
    const layer = makeLayer(inner);

    await Effect.runPromise(
      Effect.gen(function* () {
        const enforcement = yield* EntitlementEnforcementService;
        return yield* enforcement.completeWithEnforcement({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "team scoped" }],
          team: "acme",
        });
      }).pipe(Effect.provide(layer))
    );

    const usage = await createUsageStore(env).getUsage("acme");
    expect(usage.inferenceCalls).toBe(1);
  });

  it(
    "sync credit hold/capture on inference when credits enforcement is on",
    { timeout: 15_000 },
    async () => {
      env = {
        ...env,
        CLAWQL_CREDITS_ENABLED: "1",
        CLAWQL_CREDITS_ENFORCE_INFERENCE: "1",
        CLAWQL_CREDITS_INFERENCE_COST_CENTS: "25",
        CLAWQL_ACH_TOPUP_ENABLED: "1",
        CLAWQL_ACH_TOPUP_DRY_RUN: "1",
      };
      resetPaymentsEffectRuntimeForTests();

      await Effect.runPromise(
        Effect.gen(function* () {
          const ach = yield* AchTopupService;
          yield* ach.createTopup({
            customerId: "cus_test",
            amountUsd: 1,
            tenantId: "default",
          });
        }).pipe(Effect.provide(paymentsServicesLiveLayer(env)))
      );

      const inner = new StubGateway();
      const layer = makeLayer(inner);
      await Effect.runPromise(
        Effect.gen(function* () {
          const enforcement = yield* EntitlementEnforcementService;
          return yield* enforcement.completeWithEnforcement({
            model: "openai/gpt-4o",
            messages: [{ role: "user", content: "paid" }],
            correlationId: "corr-credit-1",
          });
        }).pipe(Effect.provide(layer))
      );

      const account = await Effect.runPromise(
        Effect.gen(function* () {
          const ledger = yield* CreditsLedgerService;
          return yield* ledger.getAccount("default");
        }).pipe(Effect.provide(paymentsServicesLiveLayer(env)))
      );
      expect(account.balanceCents).toBe(75);
      expect(inner.calls).toHaveLength(1);
    }
  );

  it("denies inference when credits are insufficient", { timeout: 15_000 }, async () => {
    env = {
      ...env,
      CLAWQL_CREDITS_ENABLED: "1",
      CLAWQL_CREDITS_ENFORCE_INFERENCE: "1",
      CLAWQL_CREDITS_INFERENCE_COST_CENTS: "50",
      CLAWQL_PAYMENTS_ENFORCE_INFERENCE: "0",
    };
    resetPaymentsEffectRuntimeForTests();

    const inner = new StubGateway();
    const layer = makeLayer(inner);
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const enforcement = yield* EntitlementEnforcementService;
        return yield* enforcement.completeWithEnforcement({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "no balance" }],
          correlationId: "corr-empty",
        });
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    expect(inner.calls).toHaveLength(0);
  });
});
