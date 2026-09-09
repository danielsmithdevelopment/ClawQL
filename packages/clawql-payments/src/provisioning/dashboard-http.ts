/**
 * CPC self-serve dashboard HTTP — `/credits/org*`.
 * Auth: same gate as credits HATEOAS (mounted under `/credits`).
 */

import type { Express, Request, Response } from "express";
import { Effect } from "effect";
import { IssuedApiKeyStoreService } from "clawql-auth";
import { listPaymentAuditEntries } from "../audit/worm.js";
import { findOrgsForTenant, getOrg } from "../credits/org.js";
import { getOrgUnifiedSpendSummary } from "../credits/org-spend.js";
import { TopologyService } from "../dashboard/topology-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { createCustomerPortalSession } from "../stripe/portal.js";
import { apiKeyScopesForPlan } from "./helpers.js";
import {
  renderCpcDashboardErrorHtml,
  renderCpcDashboardHtml,
  type CpcDashboardModel,
} from "./dashboard-html.js";
import type { ClawqlPlanId } from "../plans/tiers.js";

const runHtmlSync = <A>(program: Effect.Effect<A>): A => Effect.runSync(program);

function q(req: Request, name: string): string {
  const v = req.query[name] ?? req.body?.[name];
  return typeof v === "string" ? v.trim() : "";
}

function mcpUiTraceBase(env: NodeJS.ProcessEnv): string {
  const override = env.CLAWQL_MCP_UI_TRACE_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  return "/mcp-ui/trace";
}

async function resolveOrgId(
  req: Request,
  env: NodeJS.ProcessEnv
): Promise<{
  orgId: string;
  actorTenantId: string;
} | null> {
  const actor =
    q(req, "actorTenantId") ||
    q(req, "tenant") ||
    q(req, "tenantId") ||
    (typeof req.body?.actorTenantId === "string" ? req.body.actorTenantId.trim() : "") ||
    "default";
  let orgId = q(req, "orgId") || (typeof req.body?.orgId === "string" ? req.body.orgId.trim() : "");
  if (!orgId) {
    const orgs = await findOrgsForTenant(actor, env);
    orgId = orgs[0]?.orgId ?? "";
  }
  if (!orgId) return null;
  return { orgId, actorTenantId: actor };
}

async function buildDashboardModel(
  orgId: string,
  actorTenantId: string,
  env: NodeJS.ProcessEnv,
  flash?: { secret?: string; message?: string }
): Promise<CpcDashboardModel> {
  const org = await getOrg(orgId, env);
  if (!org) throw new Error(`Unknown org: ${orgId}`);

  const spend = await getOrgUnifiedSpendSummary(
    {
      orgId,
      actorTenantId: org.billingAdminTenantIds.includes(actorTenantId) ? actorTenantId : undefined,
      includeWormSpend: true,
      wormLimit: 500,
    },
    env
  );

  const keys = await runPaymentsEffect(
    Effect.gen(function* () {
      const store = yield* IssuedApiKeyStoreService;
      return yield* store.listActive({ orgId });
    }),
    env
  );

  const traceBase = mcpUiTraceBase(env);
  const topology = await runPaymentsEffect(
    Effect.gen(function* () {
      const topo = yield* TopologyService;
      return yield* topo.aggregate({
        orgId,
        mcpUiTraceBase: traceBase,
      });
    }),
    env
  );

  const wormEntries = await listPaymentAuditEntries(40, env);
  const orgWorm = wormEntries.filter(
    (e) =>
      e.payload.org_id === orgId ||
      e.payload.tenant_id === org.poolTenantId ||
      org.members.some((m) => m.memberTenantId === e.payload.tenant_id)
  );

  const topup = new URLSearchParams({ tenant: actorTenantId }).toString();
  return {
    org,
    actorTenantId,
    spend,
    keys,
    topology,
    wormEntries: orgWorm.length ? orgWorm : wormEntries.slice(0, 12),
    flashSecret: flash?.secret,
    flashMessage: flash?.message,
    portalAvailable: Boolean(org.stripeCustomerId?.trim()),
    mcpUiTraceBase: traceBase,
    creditsTopupHref: `/credits/topup?${topup}`,
    returnPath: `/credits/org?orgId=${encodeURIComponent(orgId)}&tenant=${encodeURIComponent(actorTenantId)}`,
  };
}

/**
 * Mount CPC dashboard under `/credits/org` (caller should already apply credits auth).
 */
export function attachCpcDashboardRoutes(
  app: Express,
  options: { env?: NodeJS.ProcessEnv } = {}
): void {
  const env = options.env ?? process.env;

  app.get("/credits/org", async (req: Request, res: Response) => {
    try {
      const resolved = await resolveOrgId(req, env);
      if (!resolved) {
        res
          .status(400)
          .type("html")
          .send(
            runHtmlSync(
              renderCpcDashboardErrorHtml({
                title: "Org required",
                message:
                  "Pass ?orgId=…&tenant=… (billing admin or member tenant). Provision an org first via CLI or Checkout.",
              })
            )
          );
        return;
      }
      const model = await buildDashboardModel(resolved.orgId, resolved.actorTenantId, env, {
        message: typeof req.query.flash === "string" ? req.query.flash : undefined,
        secret: typeof req.query.key === "string" ? req.query.key : undefined,
      });
      res.type("html").send(runHtmlSync(renderCpcDashboardHtml(model)));
    } catch (e) {
      res
        .status(500)
        .type("html")
        .send(
          runHtmlSync(
            renderCpcDashboardErrorHtml({
              title: "Dashboard error",
              message: e instanceof Error ? e.message : String(e),
            })
          )
        );
    }
  });

  app.post("/credits/org/portal", async (req: Request, res: Response) => {
    try {
      const orgId = String(req.body?.orgId ?? "").trim();
      const actorTenantId = String(req.body?.actorTenantId ?? "").trim() || "default";
      const org = await getOrg(orgId, env);
      if (!org?.stripeCustomerId) {
        res.status(400).type("text/plain").send("Org has no stripeCustomerId");
        return;
      }
      if (!org.billingAdminTenantIds.includes(actorTenantId)) {
        res.status(403).type("text/plain").send("Actor is not a billing admin");
        return;
      }
      const returnUrl =
        env.CLAWQL_CPC_DASHBOARD_RETURN_URL?.trim() ||
        `${req.protocol}://${req.get("host")}/credits/org?orgId=${encodeURIComponent(orgId)}&tenant=${encodeURIComponent(actorTenantId)}#billing`;
      const session = await createCustomerPortalSession({
        customerId: org.stripeCustomerId,
        returnUrl,
        env,
      });
      res.redirect(303, session.url);
    } catch (e) {
      res
        .status(500)
        .type("text/plain")
        .send(e instanceof Error ? e.message : String(e));
    }
  });

  const issueOrRotate = async (
    req: Request,
    res: Response,
    opts: { revokeKeyId?: string }
  ): Promise<void> => {
    const orgId = String(req.body?.orgId ?? "").trim();
    const actorTenantId = String(req.body?.actorTenantId ?? "").trim() || "default";
    const org = await getOrg(orgId, env);
    if (!org) {
      res.status(404).type("text/plain").send("Unknown org");
      return;
    }
    if (!org.billingAdminTenantIds.includes(actorTenantId)) {
      res.status(403).type("text/plain").send("Actor is not a billing admin");
      return;
    }
    const planId = (org.planId ?? "team") as ClawqlPlanId;
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const store = yield* IssuedApiKeyStoreService;
        if (opts.revokeKeyId) {
          yield* store.revoke(opts.revokeKeyId);
        }
        return yield* store.issue({
          subjectId: actorTenantId,
          orgId,
          role: "billing_admin",
          scope: apiKeyScopesForPlan(planId),
          label: opts.revokeKeyId ? `rotated:${opts.revokeKeyId}` : `dashboard:${orgId}`,
        });
      }),
      env
    );
    const flash = new URLSearchParams({
      orgId,
      tenant: actorTenantId,
      flash: opts.revokeKeyId ? "Key rotated — new secret below" : "New API key issued",
      key: result.secret,
    });
    res.redirect(303, `/credits/org?${flash.toString()}#keys`);
  };

  app.post("/credits/org/keys/issue", (req, res) => {
    void issueOrRotate(req, res, {});
  });

  app.post("/credits/org/keys/rotate", (req, res) => {
    const keyId = String(req.body?.keyId ?? "").trim();
    if (!keyId) {
      res.status(400).type("text/plain").send("keyId required");
      return;
    }
    void issueOrRotate(req, res, { revokeKeyId: keyId });
  });
}
