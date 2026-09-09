/**
 * §5 live smoke: provision org → register gateway+agent → dashboard tree + trace link.
 * Not a unit stand-in — hits real registry stores and HTTP handlers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { GatewayRegistryService, gatewayRegistryLiveLayer } from "clawql-network";
import { AgentInstanceRegistryService, agentInstanceRegistryLiveLayer } from "clawql-agents";
import { attachMcpUiRoutes } from "mcp-api-adapter";
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
import { aggregateTopologyFromRegistries } from "../dashboard/topology-service.js";

async function withDashAndMcpUi(
  env: NodeJS.ProcessEnv,
  run: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  attachCpcDashboardRoutes(app, { env });
  attachMcpUiRoutes(app, {
    path: "/mcp-ui",
    getCatalog: () => ({
      tools: [],
      fetchedAt: new Date().toISOString(),
      upstream: "topology-smoke",
      upstreamKind: "http" as const,
      surfaces: ["mcp-ui"],
    }),
    callTool: async () => ({ content: [], isError: false }),
  });
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

describe("§5 live topology smoke", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-topo-live-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_CREDITS_HATEOAS_PUBLIC = "1";
    process.env.CLAWQL_MCP_UI_TRACE_BASE = "/mcp-ui/trace";
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
    delete process.env.CLAWQL_MCP_UI_TRACE_BASE;
    await rm(home, { recursive: true, force: true });
  });

  it("provision → register gateway+agent → tree (not empty) → trace resolves", async () => {
    const provisioned = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* ProvisionOrgService;
        return yield* svc.provisionOrg({
          orgName: "Smoke Co",
          orgId: "smoke",
          ownerEmail: "owner@smoke.test",
          planId: "pro",
          createdVia: "enterprise_sales",
          billingMode: "stripe_invoice",
        });
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const gw = yield* GatewayRegistryService;
        yield* gw.registerGateway({
          gatewayId: "gw-east",
          orgId: "smoke",
          kind: "regional",
          meshIdentity: "us-east-1",
        });
      }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const agents = yield* AgentInstanceRegistryService;
        yield* agents.registerAgentInstance({
          agentId: "hermes-042",
          agentType: "hermes",
          parentGatewayId: "gw-east",
          orgId: "smoke",
        });
      }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
    );

    const tree = await Effect.runPromise(
      aggregateTopologyFromRegistries(
        { orgId: "smoke", mcpUiTraceBase: "/mcp-ui/trace" },
        process.env
      )
    );

    // --- report artifacts via console for the operator ---
    // eslint-disable-next-line no-console
    console.log(
      "\n=== AGGREGATED TREE ===\n" + JSON.stringify(tree, null, 2) + "\n=======================\n"
    );

    expect(tree.empty).toBe(false);
    expect(tree.sources).toContain("gateway-registry");
    expect(tree.sources).toContain("agent-instance-registry");
    expect(tree.sources).not.toContain("compensation-accounts");
    expect(tree.gateways).toHaveLength(1);
    expect(tree.gateways[0]!.gatewayId).toBe("gw-east");
    expect(tree.gateways[0]!.kind).toBe("regional");
    expect(tree.gateways[0]!.meshIdentity).toBe("us-east-1");
    expect(tree.gateways[0]!.children).toHaveLength(1);
    expect(tree.gateways[0]!.children[0]!.agentId).toBe("hermes-042");
    expect(tree.gateways[0]!.children[0]!.agentType).toBe("hermes");
    expect(tree.gateways[0]!.children[0]!.parentGatewayId).toBe("gw-east");
    expect(tree.gateways[0]!.children[0]!.traceLink).toBe(
      "/mcp-ui/trace/compare?focus=hermes-042"
    );

    await withDashAndMcpUi(process.env, async (base) => {
      const dashRes = await fetch(
        `${base}/credits/org?orgId=smoke&tenant=${encodeURIComponent(provisioned.ownerMemberTenantId)}`
      );
      expect(dashRes.status).toBe(200);
      const html = await dashRes.text();

      // eslint-disable-next-line no-console
      console.log("\n=== DASHBOARD TOPOLOGY SNIPPET ===");
      const topoIdx = html.indexOf('id="topology"');
      // eslint-disable-next-line no-console
      console.log(html.slice(topoIdx, topoIdx + 1800));
      // eslint-disable-next-line no-console
      console.log("=== END SNIPPET ===\n");

      expect(html).not.toContain("Connect your first gateway");
      expect(html).not.toContain("coming soon");
      expect(html).not.toContain("compensation agents");
      // UI labels use meshIdentity + agent display name (not raw gatewayId)
      expect(html).toContain("[Regional Gateway: us-east-1]");
      expect(html).toContain("Hermes hermes-042");
      expect(html).toContain("Sources: gateway-registry, agent-instance-registry");
      expect(html).toContain("/mcp-ui/trace/compare?focus=hermes-042");
      expect(html).toContain('data-trace-src="/mcp-ui/trace/compare?focus=hermes-042"');
      expect(html).toContain('id="trace-embed"');
      expect(html).toMatch(/dot-healthy/);

      const traceHref = "/mcp-ui/trace/compare?focus=hermes-042";
      const traceRes = await fetch(`${base}${traceHref}`);
      const traceHtml = await traceRes.text();

      // eslint-disable-next-line no-console
      console.log("\n=== TRACE LINK RESPONSE ===");
      // eslint-disable-next-line no-console
      console.log("status:", traceRes.status);
      // eslint-disable-next-line no-console
      console.log("content-type:", traceRes.headers.get("content-type"));
      // eslint-disable-next-line no-console
      console.log("title/body markers:", {
        hasFlamegraph: /flame|compare|trace/i.test(traceHtml),
        hasSvgOrBars: /svg|fg-|flamegraph|bar/i.test(traceHtml),
        focusQueryEcho: traceHtml.includes("focus"),
        snippet: traceHtml.slice(0, 600).replace(/\s+/g, " "),
      });
      // eslint-disable-next-line no-console
      console.log("=== END TRACE ===\n");

      expect(traceRes.status).toBe(200);
      expect(traceRes.headers.get("content-type") ?? "").toMatch(/html/);
      // Demo compare page must render (not 404 / "No trace")
      expect(traceHtml).not.toMatch(/No trace for session/i);
      expect(traceHtml).toMatch(/compare|flame|compression/i);
    });
  });
});
