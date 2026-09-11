import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { CreditsLedgerService } from "../credits/ledger.js";
import { resetOrgCreditsForTests } from "../credits/org.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { ProvisionOrgService } from "./provision-org-service.js";
import { attachCpcDashboardRoutes } from "./dashboard-http.js";
import { renderCpcDashboardHtml } from "./dashboard-html.js";
import type { CpcDashboardModel } from "./dashboard-html.js";
import { aggregateTopologyFromRegistries } from "../dashboard/topology-service.js";

async function withApp(
  env: NodeJS.ProcessEnv,
  run: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  attachCpcDashboardRoutes(app, { env });
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

describe("CPC dashboard", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-cpc-dash-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_CREDITS_HATEOAS_PUBLIC = "1";
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
    delete process.env.CLAWQL_CREDITS_HATEOAS_PUBLIC;
    await rm(home, { recursive: true, force: true });
  });

  it("renders full-scope section anchors including topology", () => {
    const model: CpcDashboardModel = {
      org: {
        orgId: "acme",
        displayName: "Acme",
        poolTenantId: "org:acme:pool",
        billingAdminTenantIds: ["acme:owner"],
        rolePolicies: [],
        members: [
          {
            memberTenantId: "acme:owner",
            allocationRoleId: "staff",
            orgRole: "billing_admin",
            status: "active",
            joinedAt: new Date().toISOString(),
          },
        ],
        periodEndPolicy: "expire_to_pool",
        planId: "team",
        billingMode: "hybrid",
        createdVia: "self_serve",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      actorTenantId: "acme:owner",
      spend: {
        orgId: "acme",
        poolTenantId: "org:acme:pool",
        poolBalanceCents: 0,
        poolSpendableCents: 0,
        memberBalanceCents: 0,
        totalCreditsCents: 0,
        members: [],
        generatedAt: new Date().toISOString(),
      },
      keys: [],
      topology: { empty: true, gateways: [], sources: [] },
      wormEntries: [],
      portalAvailable: false,
      mcpUiTraceBase: "/mcp-ui/trace",
      creditsTopupHref: "/credits/topup?tenant=acme:owner",
      returnPath: "/credits/org?orgId=acme",
    };
    const html = Effect.runSync(renderCpcDashboardHtml(model));
    expect(html).toContain('id="billing"');
    expect(html).toContain('id="keys"');
    expect(html).toContain('id="usage"');
    expect(html).toContain('id="topology"');
    expect(html).toContain('id="traces"');
    expect(html).not.toContain('id="agents"');
    expect(html).toContain("Connect your first gateway");
    expect(html).toContain("gateway registry");
    expect(html).toContain("agent-instance registry");
    expect(html).not.toContain("compensation agents");
    expect(html).not.toContain("compensation-accounts");
    expect(html).toContain("trace-embed");
    expect(html).toContain("/mcp-ui/trace/compare");
    expect(html).toContain("getOrgUnifiedSpendSummary");
    expect(html).toContain("Claw<span>QL</span>");
    expect(html).not.toContain("coming soon");
  });

  it("renders topology tree with status dots and trace links", () => {
    const model: CpcDashboardModel = {
      org: {
        orgId: "acme",
        displayName: "Acme",
        poolTenantId: "org:acme:pool",
        billingAdminTenantIds: ["acme:owner"],
        rolePolicies: [],
        members: [],
        periodEndPolicy: "expire_to_pool",
        planId: "team",
        billingMode: "hybrid",
        createdVia: "self_serve",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      actorTenantId: "acme:owner",
      spend: {
        orgId: "acme",
        poolTenantId: "org:acme:pool",
        poolBalanceCents: 0,
        poolSpendableCents: 0,
        memberBalanceCents: 0,
        totalCreditsCents: 0,
        members: [],
        generatedAt: new Date().toISOString(),
      },
      keys: [],
      topology: {
        empty: false,
        sources: ["gateway-registry", "agent-instance-registry"],
        gateways: [
          {
            gatewayId: "gw1",
            kind: "regional",
            meshIdentity: "us-east-1",
            lastSeen: new Date().toISOString(),
            status: "healthy",
            children: [
              {
                agentId: "hermes-042",
                kind: "persistent",
                agentType: "hermes",
                parentGatewayId: "gw1",
                lastActive: new Date().toISOString(),
                traceLink: "/mcp-ui/trace/compare?focus=hermes-042",
                status: "healthy",
              },
            ],
          },
        ],
      },
      wormEntries: [],
      portalAvailable: false,
      mcpUiTraceBase: "/mcp-ui/trace",
      creditsTopupHref: "/credits/topup?tenant=acme:owner",
      returnPath: "/credits/org?orgId=acme",
    };
    const html = Effect.runSync(renderCpcDashboardHtml(model));
    expect(html).toContain("dot-healthy");
    expect(html).toContain("Hermes hermes-042");
    expect(html).toContain("/mcp-ui/trace/compare?focus=hermes-042");
    expect(html).toContain("<details>");
  });

  it("serves dashboard after provision", async () => {
    const provisioned = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* ProvisionOrgService;
        return yield* svc.provisionOrg({
          orgName: "Dash Co",
          orgId: "dashco",
          ownerEmail: "owner@dash.co",
          planId: "pro",
          createdVia: "enterprise_sales",
          billingMode: "stripe_invoice",
        });
      })
    );

    await withApp(process.env, async (base) => {
      const res = await fetch(
        `${base}/credits/org?orgId=dashco&tenant=${encodeURIComponent(provisioned.ownerMemberTenantId)}`
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Plan / billing");
      expect(html).toContain("API keys");
      expect(html).toContain("dashco");
      expect(html).toContain("pro");
      // §5 empty state against real (empty) registries — not ledger/heuristic stand-in
      expect(html).toContain("Connect your first gateway");
      expect(html).toContain("gateway registry");
      expect(html).not.toContain("compensation agents");
      expect(html).not.toContain("coming soon");
    });
  });

  it("empty-state HTML matches aggregateTopologyFromRegistries for a new org", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-dash-empty-topo-"));
    try {
      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries(
          { orgId: "brand-new", mcpUiTraceBase: "/mcp-ui/trace" },
          { CLAWQL_HOME: home }
        )
      );
      expect(tree.empty).toBe(true);
      expect(tree.sources).toEqual([]);
      const html = Effect.runSync(
        renderCpcDashboardHtml({
          org: {
            orgId: "brand-new",
            displayName: "Brand New",
            poolTenantId: "org:brand-new:pool",
            billingAdminTenantIds: ["brand-new:owner"],
            rolePolicies: [],
            members: [],
            periodEndPolicy: "expire_to_pool",
            planId: "free",
            billingMode: "prepaid_credits",
            createdVia: "self_serve",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          actorTenantId: "brand-new:owner",
          spend: {
            orgId: "brand-new",
            poolTenantId: "org:brand-new:pool",
            poolBalanceCents: 0,
            poolSpendableCents: 0,
            memberBalanceCents: 0,
            totalCreditsCents: 0,
            members: [],
            generatedAt: new Date().toISOString(),
          },
          keys: [],
          topology: tree,
          wormEntries: [],
          portalAvailable: false,
          mcpUiTraceBase: "/mcp-ui/trace",
          creditsTopupHref: "/credits/topup?tenant=brand-new:owner",
          returnPath: "/credits/org?orgId=brand-new",
        })
      );
      expect(html).toContain("Connect your first gateway");
      expect(html).toContain('class="empty-topo"');
      expect(html).not.toContain("compensation");
      expect(html).not.toContain("coming soon");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
