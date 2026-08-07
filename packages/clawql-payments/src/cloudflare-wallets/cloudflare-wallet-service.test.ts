import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { AuditLive } from "clawql-core";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import { normalizeCloudflarePayHandle } from "./config.js";
import { CloudflareWalletService, cloudflareWalletLiveLayer } from "./cloudflare-wallet-service.js";

function provideService(env: NodeJS.ProcessEnv) {
  return cloudflareWalletLiveLayer(env).pipe(
    Layer.provide(
      paymentAuditLiveLayer(env).pipe(
        Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(env)))
      )
    )
  );
}

describe("normalizeCloudflarePayHandle", () => {
  it("normalizes @handle and bare names", () => {
    expect(normalizeCloudflarePayHandle("@clawql")).toBe("clawql.cloudflare.pay");
    expect(normalizeCloudflarePayHandle("clawql")).toBe("clawql.cloudflare.pay");
    expect(normalizeCloudflarePayHandle("clawql.cloudflare.pay")).toBe("clawql.cloudflare.pay");
    expect(normalizeCloudflarePayHandle("https://clawql.cloudflare.pay/")).toBe(
      "clawql.cloudflare.pay"
    );
  });
});

describe("CloudflareWalletService dry-run", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-cfw-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CLOUDFLARE_WALLETS = "1";
    process.env.CLAWQL_CLOUDFLARE_WALLETS_HANDLE = "clawql.cloudflare.pay";
    delete process.env.CLAWQL_CLOUDFLARE_WALLETS_DRY_RUN;
    delete process.env.CLOUDFLARE_WALLETS_API_BASE;
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CLOUDFLARE_WALLETS;
    delete process.env.CLAWQL_CLOUDFLARE_WALLETS_HANDLE;
    resetPaymentsEffectRuntimeForTests();
    await rm(home, { recursive: true, force: true });
  });

  it("resolves reserved handle and issues/revokes a virtual wallet", async () => {
    const program = Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      const identity = yield* cfw.resolveHandle({});
      expect(identity.handle).toBe("clawql.cloudflare.pay");
      expect(identity.reserved).toBe(true);
      expect(identity.oneOfOne).toBe(true);

      const wallet = yield* cfw.createVirtualWallet({
        agentId: "agent-recruit-1",
        allowanceUsd: 50,
        maxTxUsd: 10,
        merchantAllowList: ["https://api.example.com"],
      });
      expect(wallet.id).toMatch(/^cfw_dry_/);
      expect(wallet.remainingUsd).toBe(50);
      expect(wallet.dryRun).toBe(true);

      const status = yield* cfw.getSpendStatus({ walletId: wallet.id });
      expect(status.status).toBe("active");

      const revoked = yield* cfw.revokeVirtualWallet({ walletId: wallet.id });
      expect(revoked.status).toBe("revoked");
    });

    await Effect.runPromise(program.pipe(Effect.provide(provideService(process.env))));
  });

  it("fails when disabled", async () => {
    delete process.env.CLAWQL_CLOUDFLARE_WALLETS;
    const program = Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      return yield* Effect.either(cfw.resolveHandle({}));
    });
    const either = await Effect.runPromise(
      program.pipe(Effect.provide(provideService(process.env)))
    );
    expect(either._tag).toBe("Left");
    if (either._tag === "Left") {
      expect(either.left.reason).toMatch(/disabled/i);
    }
  });
});
