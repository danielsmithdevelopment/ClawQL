/**
 * Minimal HTMX/HATEOAS HTTP surface for credits pay + request deep links.
 * Mount with {@link attachCreditsHateoasRoutes} on the MCP HTTP gateway.
 *
 * Money movement still requires stage → confirm (accept only stages).
 * These routes are for deep-link landing + local/dev HTMX; put them behind
 * gateway auth in production.
 */

import { Effect } from "effect";
import type { Express, Request, Response } from "express";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { CreditsService } from "./credits-service.js";
import {
  buildClawqlPayUri,
  buildPayDeepLink,
  buildPayQrPayload,
  buildRequestDeepLink,
  parsePayDeepLinkQuery,
  payCliHint,
  payHateoasEnvelope,
  type PayDeepLink,
} from "./deeplinks.js";
import {
  escapeHtml,
  renderCreditsHateoasPage,
  renderCreditsMiniHomeHtml,
  renderQrSvg,
  wantsHtml,
} from "./hateoas-html.js";
import {
  acceptMoneyRequest,
  claimMoneyRequestInvite,
  declineMoneyRequest,
  getMoneyRequest,
  publicMoneyRequest,
  type MoneyRequest,
} from "./requests.js";

const esc = escapeHtml;

function payPageHtml(pay: PayDeepLink): string {
  const envelope = payHateoasEnvelope(pay);
  const cli = payCliHint(pay);
  const clawql = buildClawqlPayUri(pay);
  const qrQs = new URLSearchParams({
    to: pay.to,
    ...(pay.amountUsd != null ? { amount: String(pay.amountUsd) } : {}),
    ...(pay.note ? { note: pay.note } : {}),
  }).toString();
  const amountLabel =
    pay.amountUsd != null ? `$${Number(pay.amountUsd).toFixed(2)}` : "Credits";

  const body = `
    <header>
      <h1 class="brand">Claw<span>QL</span></h1>
      <p class="lede">Send prepaid credits. This page does not move money — confirm in the CLI.</p>
    </header>
    <section class="hero" aria-label="Payment">
      <p class="amount">${esc(amountLabel)}</p>
      <p class="payee">to <strong>${esc(pay.to)}</strong>${pay.note ? ` · ${esc(pay.note)}` : ""}</p>
      <div class="cta-row">
        <a class="btn" href="${esc(clawql)}">Open clawql://</a>
        <button type="button" class="btn ghost" data-cli="${esc(cli)}" onclick="navigator.clipboard.writeText(this.dataset.cli)">Copy CLI</button>
      </div>
    </section>
    <div class="visual" aria-label="Payment QR">
      <img alt="Payment QR code" width="280" height="280" src="/credits/qr.svg?${esc(qrQs)}" />
    </div>
    <div class="meta-block">
      <details>
        <summary>CLI &amp; details</summary>
        <pre>${esc(cli)}</pre>
        <p class="muted">Scheme: <code>${esc(clawql)}</code></p>
      </details>
    </div>
  `;
  return renderCreditsHateoasPage({
    title: "Pay with ClawQL",
    heading: "ClawQL",
    summary: envelope.summary,
    bodyHtml: body,
    envelope,
    hideLinksPanel: true,
  });
}

function invitePageHtml(token: string, requestId: string): string {
  const body = `
    <header>
      <h1 class="brand">Claw<span>QL</span></h1>
      <p class="lede">Join and link this money request to your directory identity.</p>
    </header>
    <section class="hero">
      <p class="payee">Request <code>${esc(requestId)}</code></p>
      <form hx-post="/credits/request/invite/claim" hx-target="#result" hx-swap="innerHTML" class="compose-grid">
        <input type="hidden" name="token" value="${esc(token)}" />
        <input type="hidden" name="requestId" value="${esc(requestId)}" />
        <label>Tenant id <input name="tenantId" required autocomplete="username" placeholder="your-tenant" /></label>
        <label>Email <input name="email" type="email" autocomplete="email" placeholder="optional if invite email known" /></label>
        <label>Optional @username <input name="handle" type="text" autocomplete="nickname" placeholder="optional" /></label>
        <div class="cta-row"><button type="submit">Claim invite</button></div>
      </form>
      <div id="result"></div>
    </section>
  `;
  return renderCreditsHateoasPage({
    title: "Credits invite",
    heading: "ClawQL",
    summary: "Join ClawQL and link this request to your tenant.",
    bodyHtml: body,
    hideLinksPanel: true,
  });
}

function requestPageHtml(reqRow: MoneyRequest): string {
  const amountUsd = (reqRow.amountCents / 100).toFixed(2);
  const self = buildRequestDeepLink({ requestId: reqRow.requestId });
  const body = `
    <header>
      <h1 class="brand">Claw<span>QL</span></h1>
      <p class="lede">Money request · ${esc(reqRow.status)}. Accept only stages payment.</p>
    </header>
    <section class="hero">
      <p class="amount">$${esc(amountUsd)}</p>
      <p class="payee">from <strong>${esc(reqRow.requesterTenantId)}</strong>
        → ${esc(reqRow.payerTenantId ?? "invite pending")}${reqRow.note ? ` · ${esc(reqRow.note)}` : ""}</p>
      ${
        reqRow.status === "pending"
          ? `
      <form hx-post="/credits/request/${esc(reqRow.requestId)}/accept" hx-target="#result" hx-swap="innerHTML" class="compose-grid">
        <label>Payer tenant id <input name="payerTenantId" value="${esc(reqRow.payerTenantId ?? "")}" required /></label>
        <div class="cta-row">
          <button type="submit">Accept (stage)</button>
        </div>
      </form>
      <form hx-post="/credits/request/${esc(reqRow.requestId)}/decline" hx-target="#result" hx-swap="innerHTML" class="compose-grid">
        <label>Payer tenant id <input name="payerTenantId" value="${esc(reqRow.payerTenantId ?? "")}" required /></label>
        <div class="cta-row"><button type="submit" class="btn ghost">Decline</button></div>
      </form>`
          : ""
      }
      ${
        reqRow.stagedTransferActionId
          ? `<p class="note">Staged: <code>${esc(reqRow.stagedTransferActionId)}</code></p>`
          : ""
      }
      <div id="result"></div>
    </section>
    <div class="meta-block">
      <p class="muted">After accept: <code>clawql payments credits transfer --confirm --action-id … --code …</code></p>
    </div>
  `;
  return renderCreditsHateoasPage({
    title: `Request ${reqRow.requestId}`,
    heading: "ClawQL",
    summary: `$${amountUsd} · ${reqRow.status}`,
    bodyHtml: body,
    envelope: {
      ok: true,
      kind: "credits.request",
      summary: `Request ${reqRow.requestId}`,
      data: publicMoneyRequest(reqRow) as unknown as Record<string, unknown>,
      links: { self, approval_url: self },
      approval_url: self,
    },
    hideLinksPanel: true,
  });
}

function sendJsonOrHtml(
  req: Request,
  res: Response,
  html: string,
  json: unknown,
  status = 200
): void {
  if (wantsHtml(req.get("accept") ?? undefined)) {
    res.status(status).type("html").send(html);
    return;
  }
  res.status(status).json(json);
}

/**
 * Attach GET/POST routes under `/credits/*` for deep-link landing + HTMX actions.
 */
export function attachCreditsHateoasRoutes(app: Express): void {
  app.get("/credits", (_req: Request, res: Response) => {
    res.type("html").send(renderCreditsMiniHomeHtml());
  });
  app.get("/credits/ui", (_req: Request, res: Response) => {
    res.type("html").send(renderCreditsMiniHomeHtml());
  });

  app.get("/credits/pay", (req: Request, res: Response) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      if (!String(q.to ?? "").trim()) {
        res.type("html").send(renderCreditsMiniHomeHtml());
        return;
      }
      const pay = parsePayDeepLinkQuery(q);
      const html = payPageHtml(pay);
      sendJsonOrHtml(req, res, html, payHateoasEnvelope(pay));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).type("text/plain").send(msg);
    }
  });

  app.get("/credits/qr.svg", async (req: Request, res: Response) => {
    try {
      const pay = parsePayDeepLinkQuery(req.query as Record<string, string | undefined>);
      const svg = await renderQrSvg(buildPayQrPayload(pay));
      res.type("image/svg+xml").send(svg);
    } catch (e) {
      res.status(400).type("text/plain").send(e instanceof Error ? e.message : String(e));
    }
  });

  app.get("/credits/request/invite", (req: Request, res: Response) => {
    const token = String(req.query.token ?? "").trim();
    const requestId = String(
      req.query.request_id ?? req.query.requestId ?? ""
    ).trim();
    if (!token || !requestId) {
      res.status(400).type("html").send(
        renderCreditsHateoasPage({
          title: "Invite",
          heading: "Missing parameters",
          bodyHtml:
            "<p>Add <code>?request_id=…&amp;token=…</code> from your invite URL.</p>",
        }),
      );
      return;
    }
    res.type("html").send(invitePageHtml(token, requestId));
  });

  app.get("/credits/request/:requestId", async (req: Request, res: Response) => {
    const requestId = String(req.params.requestId ?? "").trim();
    const row = await getMoneyRequest(requestId);
    if (!row) {
      res.status(404).type("html").send(
        renderCreditsHateoasPage({
          title: "Not found",
          heading: "Request not found",
          bodyHtml: `<p>No request <code>${esc(requestId)}</code>.</p>`,
        }),
      );
      return;
    }
    const html = requestPageHtml(row);
    sendJsonOrHtml(req, res, html, {
      ok: true,
      kind: "credits.request",
      data: publicMoneyRequest(row),
      links: { self: buildRequestDeepLink({ requestId }) },
      approval_url: buildRequestDeepLink({ requestId }),
    });
  });

  app.post("/credits/request/invite/claim", async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token ?? "").trim();
      const requestId = String(req.body?.requestId ?? req.body?.request_id ?? "").trim();
      const tenantId = String(req.body?.tenantId ?? "").trim();
      const email = String(req.body?.email ?? "").trim();
      const handleRaw = String(req.body?.handle ?? "").trim();
      const result = await claimMoneyRequestInvite({
        requestId,
        token,
        tenantId,
        ...(email ? { email } : {}),
        ...(handleRaw ? { handle: handleRaw } : {}),
      });
      const next = buildRequestDeepLink({ requestId: result.request.requestId });
      res.type("html").send(`
        <p>Claimed${result.directoryCreated ? " (directory created)" : ""}.</p>
        <p>Status: <strong>${esc(result.request.status)}</strong> · tenant <code>${esc(result.request.payerTenantId ?? "")}</code></p>
        <p><a href="${esc(next)}">Open request</a></p>
        <p class="muted">CLI: <code>clawql payments credits request accept --request-id ${esc(result.request.requestId)} --tenant-id ${esc(tenantId)}</code></p>
      `);
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(`<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`);
    }
  });

  app.post("/credits/request/:requestId/accept", async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.requestId ?? "").trim();
      const payerTenantId = String(req.body?.payerTenantId ?? "").trim();
      const { request, staged } = await acceptMoneyRequest(
        { requestId, payerTenantId },
        async (input) =>
          runPaymentsEffect(
            Effect.gen(function* () {
              const credits = yield* CreditsService;
              return yield* credits.stageTransfer({
                fromTenantId: input.fromTenantId,
                toTenantId: input.toTenantId,
                amountCents: input.amountCents,
                note: input.note,
                correlationId: input.correlationId,
                requestId: input.requestId,
              });
            })
          )
      );
      res.type("html").send(`
        <p>Accepted — transfer staged (money not moved yet).</p>
        <p>action_id: <code>${esc(staged.actionId)}</code></p>
        <p>confirmation_code: <code>${esc(staged.confirmationCode)}</code></p>
        <pre>clawql payments credits transfer --confirm --action-id ${esc(staged.actionId)} --code ${esc(staged.confirmationCode)}${staged.totpRequired ? " --totp NNNNNN" : ""}</pre>
        <p class="muted">Request status: ${esc(request.status)}</p>
      `);
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(`<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`);
    }
  });

  app.post("/credits/request/:requestId/decline", async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.requestId ?? "").trim();
      const payerTenantId = String(req.body?.payerTenantId ?? "").trim();
      const result = await declineMoneyRequest({ requestId, payerTenantId });
      res.type("html").send(`<p>Declined. Status: <strong>${esc(result.status)}</strong></p>`);
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(`<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`);
    }
  });
}

/** @deprecated Use attachCreditsHateoasRoutes — kept for discoverability. */
export function creditsPayDeepLinkPath(input: PayDeepLink): string {
  return buildPayDeepLink(input).replace(/^[^?]*/, (p) => {
    const idx = p.indexOf("/credits/");
    return idx >= 0 ? p.slice(idx) : "/credits/pay";
  });
}
