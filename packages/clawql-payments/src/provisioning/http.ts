/**
 * Internal HTTP surface for Customer Provisioning Core.
 * Mount with {@link attachProvisioningRoutes} so Cloudflare gateway (or ops)
 * can POST into the same `provisionOrg` Effect used by CLI / Stripe webhook.
 *
 * Auth: `Authorization: Bearer <CLAWQL_CPC_PROVISION_TOKEN>`.
 * If the token env is unset, routes respond 503 (disabled).
 */

import type { Express, Request, Response, NextFunction } from "express";
import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { isClawqlPlanId } from "../plans/tiers.js";
import { provisionOrgInputFromCheckoutSession } from "./checkout-handoff.js";
import { ProvisionOrgService } from "./provision-org-service.js";
import { ReportUsageService } from "./report-usage.js";
import type { ProvisionOrgInput, ReportUsageToStripeInput } from "./types.js";
import type { OrgBillingMode, OrgCreatedVia } from "../credits/org.js";

export type AttachProvisioningRoutesOptions = {
  /** Mount prefix (default `/payments`). */
  basePath?: string;
  env?: NodeJS.ProcessEnv;
};

function bearerToken(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim();
}

function requireProvisionToken(
  env: NodeJS.ProcessEnv
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const expected = env.CLAWQL_CPC_PROVISION_TOKEN?.trim();
    if (!expected) {
      res.status(503).json({
        error: "CPC provision HTTP disabled — set CLAWQL_CPC_PROVISION_TOKEN",
      });
      return;
    }
    const presented = bearerToken(req);
    if (!presented || presented !== expected) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

function isBillingMode(v: unknown): v is OrgBillingMode {
  return (
    v === "stripe_checkout" || v === "stripe_invoice" || v === "hybrid" || v === "credits_only"
  );
}

function isCreatedVia(v: unknown): v is OrgCreatedVia {
  return v === "self_serve" || v === "enterprise_sales";
}

function parseProvisionBody(body: unknown): ProvisionOrgInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const orgName = typeof b.orgName === "string" ? b.orgName : "";
  const ownerEmail = typeof b.ownerEmail === "string" ? b.ownerEmail : "";
  const planId = typeof b.planId === "string" ? b.planId : "";
  if (!orgName.trim()) return { error: "orgName is required" };
  if (!ownerEmail.trim()) return { error: "ownerEmail is required" };
  if (!isClawqlPlanId(planId)) return { error: "planId must be free|pro|team|enterprise" };
  if (!isCreatedVia(b.createdVia)) {
    return { error: "createdVia must be self_serve|enterprise_sales" };
  }
  if (!isBillingMode(b.billingMode)) {
    return {
      error: "billingMode must be stripe_checkout|stripe_invoice|hybrid|credits_only",
    };
  }
  const additional =
    Array.isArray(b.additionalMemberEmails) &&
    b.additionalMemberEmails.every((e) => typeof e === "string")
      ? (b.additionalMemberEmails as string[])
      : undefined;
  const domains =
    Array.isArray(b.allowedEmailDomains) &&
    b.allowedEmailDomains.every((e) => typeof e === "string")
      ? (b.allowedEmailDomains as string[])
      : undefined;

  return {
    orgName,
    ownerEmail,
    planId,
    createdVia: b.createdVia,
    billingMode: b.billingMode,
    orgId: typeof b.orgId === "string" ? b.orgId : undefined,
    ownerMemberTenantId:
      typeof b.ownerMemberTenantId === "string" ? b.ownerMemberTenantId : undefined,
    stripeCustomerId: typeof b.stripeCustomerId === "string" ? b.stripeCustomerId : undefined,
    stripeSubscriptionId:
      typeof b.stripeSubscriptionId === "string" ? b.stripeSubscriptionId : undefined,
    additionalMemberEmails: additional,
    allowedEmailDomains: domains,
    seatLimit: typeof b.seatLimit === "number" ? b.seatLimit : undefined,
    correlationId: typeof b.correlationId === "string" ? b.correlationId : undefined,
    skipApiKey: b.skipApiKey === true,
  };
}

/**
 * Attach CPC provision + usage-report routes.
 * Does not install a global JSON body parser — caller should `express.json()`.
 */
export function attachProvisioningRoutes(
  app: Express,
  options: AttachProvisioningRoutesOptions = {}
): void {
  const env = options.env ?? process.env;
  const base = (options.basePath ?? "/payments").replace(/\/$/, "") || "/payments";
  const auth = requireProvisionToken(env);

  app.post(`${base}/provision-org`, auth, (req, res) => {
    void (async () => {
      const parsed = parseProvisionBody(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      try {
        const result = await runPaymentsEffect(
          Effect.gen(function* () {
            const svc = yield* ProvisionOrgService;
            return yield* svc.provisionOrg({ ...parsed, env });
          }),
          env
        );
        res.status(201).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    })();
  });

  app.post(`${base}/provision-org-from-checkout`, auth, (req, res) => {
    void (async () => {
      const body = req.body;
      const session =
        body && typeof body === "object" && "session" in body
          ? (body as { session: unknown }).session
          : body;
      if (!session || typeof session !== "object") {
        res.status(400).json({ error: "Checkout Session object required" });
        return;
      }
      const handoff = provisionOrgInputFromCheckoutSession(
        session as Parameters<typeof provisionOrgInputFromCheckoutSession>[0],
        {
          correlationId:
            typeof (body as { correlationId?: string })?.correlationId === "string"
              ? (body as { correlationId: string }).correlationId
              : undefined,
          env,
        }
      );
      if (!handoff.ok) {
        res.status(422).json({ error: handoff.reason, provisioned: false });
        return;
      }
      try {
        const result = await runPaymentsEffect(
          Effect.gen(function* () {
            const svc = yield* ProvisionOrgService;
            return yield* svc.provisionOrg({ ...handoff.input, env });
          }),
          env
        );
        res.status(201).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    })();
  });

  app.post(`${base}/report-usage`, auth, (req, res) => {
    void (async () => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const orgId = typeof b.orgId === "string" ? b.orgId.trim() : "";
      if (!orgId) {
        res.status(400).json({ error: "orgId is required" });
        return;
      }
      const input: ReportUsageToStripeInput = {
        orgId,
        month: typeof b.month === "string" ? b.month : undefined,
        overageUnits: typeof b.overageUnits === "number" ? b.overageUnits : undefined,
        correlationId: typeof b.correlationId === "string" ? b.correlationId : undefined,
        env,
      };
      try {
        const result = await runPaymentsEffect(
          Effect.gen(function* () {
            const svc = yield* ReportUsageService;
            return yield* svc.reportUsageToStripe(input);
          }),
          env
        );
        res.status(200).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    })();
  });
}
