import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { getOrg, resetOrgCreditsForTests } from "../credits/org.js";
import { CreditsLedgerService } from "../credits/ledger.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { attachProvisioningRoutes } from "./http.js";

async function withApp(
  env: NodeJS.ProcessEnv,
  run: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  attachProvisioningRoutes(app, { env });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe("attachProvisioningRoutes", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-cpc-http-"));
    env = {
      ...process.env,
      CLAWQL_HOME: home,
      CLAWQL_CREDITS_ENABLED: "1",
      CLAWQL_MANAGED_HOSTING: "1",
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
      CLAWQL_CPC_PROVISION_TOKEN: "test-cpc-token",
    };
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_CPC_PROVISION_TOKEN = "test-cpc-token";
    resetDefaultAuditRingBufferForTests();
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(process.env);
    await resetOrgCreditsForTests(process.env);
    await runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.reset();
      })
    );
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_CPC_PROVISION_TOKEN;
    await rm(home, { recursive: true, force: true });
  });

  it("rejects missing bearer", async () => {
    await withApp(env, async (base) => {
      const res = await fetch(`${base}/payments/provision-org`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  it("provisions org via HTTP", async () => {
    await withApp(env, async (base) => {
      const res = await fetch(`${base}/payments/provision-org`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-cpc-token",
        },
        body: JSON.stringify({
          orgName: "Http Co",
          orgId: "httpco",
          ownerEmail: "owner@http.co",
          planId: "team",
          createdVia: "enterprise_sales",
          billingMode: "stripe_invoice",
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { orgId: string; apiKey?: string };
      expect(body.orgId).toBe("httpco");
      expect(body.apiKey).toMatch(/^cqk_/);
      const org = await getOrg("httpco", process.env);
      expect(org?.billingMode).toBe("stripe_invoice");
    });
  });

  it("provisions from checkout session payload", async () => {
    await withApp(env, async (base) => {
      const res = await fetch(`${base}/payments/provision-org-from-checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-cpc-token",
        },
        body: JSON.stringify({
          session: {
            id: "cs_test_http",
            customer: "cus_http",
            subscription: "sub_http",
            mode: "subscription",
            metadata: {
              clawql_provision_org: "1",
              clawql_org_name: "Checkout Co",
              clawql_org_id: "checkoutco",
              clawql_plan: "pro",
            },
            customer_email: "o@checkout.co",
            customer_details: null,
          },
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { orgId: string };
      expect(body.orgId).toBe("checkoutco");
    });
  });

  it("returns 503 for checkout/session when self-serve flag unset", async () => {
    await withApp(env, async (base) => {
      const res = await fetch(`${base}/payments/checkout/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: "pro",
          orgName: "Acme",
          ownerEmail: "a@acme.com",
          successUrl: "https://example.com/ok",
          cancelUrl: "https://example.com/cancel",
        }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/CLAWQL_SELF_SERVE_CHECKOUT/);
    });
  });

  it("validates checkout/session body when self-serve enabled", async () => {
    const selfServeEnv = { ...env, CLAWQL_SELF_SERVE_CHECKOUT: "1" };
    await withApp(selfServeEnv, async (base) => {
      const res = await fetch(`${base}/payments/checkout/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/orgName/);
    });
  });

  it("requires a Supabase bearer when the plugin is enabled and ignores client supabaseUserId", async () => {
    const selfServeEnv = {
      ...env,
      CLAWQL_SELF_SERVE_CHECKOUT: "1",
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      CLAWQL_SUPABASE_JWT_SECRET: "test-supabase-jwt-secret-32chars!!",
      CLAWQL_SUPABASE_JWKS_URL: "",
    };
    await withApp(selfServeEnv, async (base) => {
      const missing = await fetch(`${base}/payments/checkout/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: "pro",
          orgName: "Acme",
          ownerEmail: "a@acme.com",
          successUrl: "https://example.com/ok",
          cancelUrl: "https://example.com/cancel",
          supabaseUserId: "victim-user-id",
        }),
      });
      expect(missing.status).toBe(401);
      const cors = missing.headers.get("access-control-allow-headers") ?? "";
      expect(cors.toLowerCase()).toContain("authorization");
    });
  });
});
