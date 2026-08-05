/**
 * Minimal HTMX/HATEOAS HTTP surface for credits pay + request deep links.
 * Mount with {@link attachCreditsHateoasRoutes} on the MCP HTTP gateway.
 *
 * Money movement still requires stage → confirm (accept only stages).
 */

import { Effect } from "effect";
import type { Express, Request, Response } from "express";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  assertPendingCode,
  savePendingAction,
} from "../compensation/pending-actions.js";
import { getActivityFeed, type ActivityItem } from "./activity.js";
import { isCreditsTransferTotpRequired } from "./config.js";
import { CreditsService } from "./credits-service.js";
import {
  buildClawqlPayUri,
  buildCreditsTransferApproveUrl,
  buildPayDeepLink,
  buildPayQrPayload,
  buildRequestDeepLink,
  parsePayDeepLinkQuery,
  payCliHint,
  payHateoasEnvelope,
  type PayDeepLink,
} from "./deeplinks.js";
import { resolveRecipient } from "./directory.js";
import {
  escapeHtml,
  renderCreditsActivityHtml,
  renderCreditsHateoasPage,
  renderCreditsMiniHomeHtml,
  renderCreditsPayComposeHtml,
  renderCreditsRequestComposeHtml,
  renderCreditsStagedTransferHtml,
  renderCreditsTopupHtml,
  renderCreditsTransferApproveHtml,
  renderCreditsTransferCancelledHtml,
  renderCreditsTransferConfirmedHtml,
  renderQrSvg,
  wantsHtml,
  type MiniHomeRecentItem,
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

function tenantFromQuery(req: Request): string {
  const q = req.query as Record<string, string | undefined>;
  return String(q.tenant ?? q.tenantId ?? "default").trim() || "default";
}

function recentFromFeed(items: ActivityItem[]): MiniHomeRecentItem[] {
  return items.slice(0, 8).map((item) => {
    const signed = item.amountCents;
    const dollars = Math.abs(signed) / 100;
    const sign = signed > 0 ? "+" : signed < 0 ? "−" : "";
    const who = item.counterpartyLabel ?? item.counterpartyTenantId ?? "";
    let title: string;
    switch (item.kind) {
      case "transfer_sent":
        title = who ? `Sent to ${who}` : "Sent";
        break;
      case "transfer_received":
        title = who ? `From ${who}` : "Received";
        break;
      case "request_out":
        title = who ? `Request → ${who}` : "Request out";
        break;
      case "request_in":
        title = who ? `Request ← ${who}` : "Request in";
        break;
      case "topup":
        title = "Top up";
        break;
      default:
        title = item.kind.replace(/_/g, " ");
    }
    if (item.note) title = `${title} · ${item.note}`;
    return {
      title,
      when: item.ts.slice(0, 10),
      amountLabel: `${sign}$${dollars.toFixed(2)}`,
      positive: signed > 0,
      href: item.requestId ? `/credits/request/${item.requestId}` : undefined,
    };
  });
}

async function homeHtml(tenantId: string): Promise<string> {
  try {
    const feed = await getActivityFeed({ tenantId, limit: 5, filter: "money" });
    return renderCreditsMiniHomeHtml({
      tenantId: feed.tenantId,
      label: feed.label,
      balanceCents: feed.balanceCents,
      recent: recentFromFeed(feed.items),
    });
  } catch {
    return renderCreditsMiniHomeHtml({
      tenantId,
      balanceCents: 0,
      recent: [],
    });
  }
}

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
    <a class="back" href="/credits">← Home</a>
    <div class="topbar" style="margin-top:0.75rem">
      <h1 class="brand">Claw<span>QL</span></h1>
    </div>
    <section class="hero" aria-label="Payment">
      <p class="amount">${esc(amountLabel)}</p>
      <p class="payee">to <strong>${esc(pay.to)}</strong>${pay.note ? ` · ${esc(pay.note)}` : ""}</p>
      <p class="lede">Stage here, then authorize with the magic link — or confirm in the CLI.</p>
      ${
        pay.amountUsd != null
          ? `<form hx-post="/credits/pay/stage" hx-target="#stage-result" hx-swap="innerHTML" class="compose-grid">
        <input type="hidden" name="to" value="${esc(pay.to)}" />
        <input type="hidden" name="amount" value="${esc(String(pay.amountUsd))}" />
        ${pay.note ? `<input type="hidden" name="note" value="${esc(pay.note)}" />` : ""}
        <label>From tenant
          <input name="from" value="${esc(pay.fromTenantId ?? "")}" required placeholder="your-tenant" autocomplete="username" />
        </label>
        <div class="cta-row">
          <button class="primary" type="submit">Stage payment</button>
          <a class="btn ghost" href="${esc(clawql)}">Open clawql://</a>
        </div>
      </form>
      <div id="stage-result"></div>`
          : `<div class="cta-row">
        <a class="btn" href="${esc(clawql)}">Open clawql://</a>
        <button type="button" class="btn ghost" data-cli="${esc(cli)}" onclick="navigator.clipboard.writeText(this.dataset.cli)">Copy CLI</button>
      </div>`
      }
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
    <a class="back" href="/credits">← Home</a>
    <div class="topbar" style="margin-top:0.75rem">
      <h1 class="brand">Claw<span>QL</span></h1>
    </div>
    <section class="hero">
      <h1 class="page-title" style="margin-top:0">Invite</h1>
      <p class="lede">Join and link this money request to your directory identity.</p>
      <p class="payee">Request <code>${esc(requestId)}</code></p>
      <form hx-post="/credits/request/invite/claim" hx-target="#result" hx-swap="innerHTML" class="compose-grid">
        <input type="hidden" name="token" value="${esc(token)}" />
        <input type="hidden" name="requestId" value="${esc(requestId)}" />
        <label>Tenant id <input name="tenantId" required autocomplete="username" placeholder="your-tenant" /></label>
        <label>Email <input name="email" type="email" autocomplete="email" placeholder="optional if invite email known" /></label>
        <label>Optional @username <input name="handle" type="text" autocomplete="nickname" placeholder="optional" /></label>
        <div class="cta-row"><button class="primary" type="submit">Claim invite</button></div>
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
    <a class="back" href="/credits">← Home</a>
    <div class="topbar" style="margin-top:0.75rem">
      <h1 class="brand">Claw<span>QL</span></h1>
    </div>
    <section class="hero">
      <p class="lede">Money request · ${esc(reqRow.status)}. Accept stages payment; authorize with the magic link.</p>
      <p class="amount">$${esc(amountUsd)}</p>
      <p class="payee">from <strong>${esc(reqRow.requesterTenantId)}</strong>
        → ${esc(reqRow.payerTenantId ?? "invite pending")}${reqRow.note ? ` · ${esc(reqRow.note)}` : ""}</p>
      ${
        reqRow.status === "pending"
          ? `
      <form hx-post="/credits/request/${esc(reqRow.requestId)}/accept" hx-target="#result" hx-swap="innerHTML" class="compose-grid">
        <label>Payer tenant id <input name="payerTenantId" value="${esc(reqRow.payerTenantId ?? "")}" required /></label>
        <div class="cta-row">
          <button class="primary" type="submit">Accept (stage)</button>
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
      <p class="muted">After accept: open the magic link, or <code>clawql payments credits transfer --confirm --action-id … --code …</code></p>
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
  app.get("/credits", async (req: Request, res: Response) => {
    res.type("html").send(await homeHtml(tenantFromQuery(req)));
  });
  app.get("/credits/ui", async (req: Request, res: Response) => {
    res.type("html").send(await homeHtml(tenantFromQuery(req)));
  });

  app.get("/credits/topup", (req: Request, res: Response) => {
    res.type("html").send(renderCreditsTopupHtml(tenantFromQuery(req)));
  });

  app.get("/credits/activity", async (req: Request, res: Response) => {
    const tenantId = tenantFromQuery(req);
    try {
      const feed = await getActivityFeed({ tenantId, limit: 40, filter: "money" });
      res.type("html").send(
        renderCreditsActivityHtml({
          tenantId: feed.tenantId,
          label: feed.label,
          balanceCents: feed.balanceCents,
          recent: recentFromFeed(feed.items),
        })
      );
    } catch (e) {
      res
        .status(500)
        .type("text/plain")
        .send(e instanceof Error ? e.message : String(e));
    }
  });

  app.get("/credits/pay", (req: Request, res: Response) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      if (!String(q.to ?? "").trim()) {
        res.type("html").send(renderCreditsPayComposeHtml(tenantFromQuery(req)));
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

  app.post("/credits/pay/stage", async (req: Request, res: Response) => {
    try {
      const to = String(req.body?.to ?? "").trim();
      const fromTenantId = String(req.body?.from ?? req.body?.fromTenantId ?? "").trim();
      const amountRaw = String(req.body?.amount ?? "").trim();
      const note = String(req.body?.note ?? "").trim();
      const amountUsd = Number(amountRaw);
      if (!to || !fromTenantId) throw new Error("from and to are required");
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error("amount must be > 0");
      const recipient = await resolveRecipient(to);
      const staged = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.stageTransfer({
            fromTenantId,
            toTenantId: recipient.tenantId,
            amountCents: Math.round(amountUsd * 100),
            ...(note ? { note } : {}),
          });
        })
      );
      res.type("html").send(
        renderCreditsStagedTransferHtml({
          actionId: staged.actionId,
          confirmationCode: staged.confirmationCode,
          approvalUrl: staged.approvalUrl,
          totpRequired: staged.totpRequired,
        })
      );
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(`<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`);
    }
  });

  app.get("/credits/transfer/approve", async (req: Request, res: Response) => {
    try {
      const actionId = String(req.query.action_id ?? req.query.actionId ?? "").trim();
      const code = String(req.query.code ?? "").trim();
      if (!actionId || !code) {
        res.status(400).type("html").send(
          renderCreditsHateoasPage({
            title: "Authorize",
            heading: "Missing parameters",
            bodyHtml: "<p>Add <code>?action_id=…&amp;code=…</code> from your magic link.</p>",
            hideLinksPanel: true,
          })
        );
        return;
      }
      const record = await assertPendingCode(actionId, code);
      if (record.kind !== "credits_transfer") {
        throw new Error(`action is kind=${record.kind}; expected credits_transfer`);
      }
      const amountCents = Number(record.args.amountCents ?? 0);
      res.type("html").send(
        renderCreditsTransferApproveHtml({
          actionId: record.actionId,
          code: record.confirmationCode,
          fromTenantId: String(record.args.fromTenantId ?? record.agentId),
          toTenantId: String(record.args.toTenantId ?? ""),
          amountUsd: amountCents / 100,
          note: typeof record.args.note === "string" ? record.args.note : undefined,
          expiresAt: record.expiresAt,
          totpRequired: isCreditsTransferTotpRequired(),
          status: record.status,
        })
      );
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(
          renderCreditsHateoasPage({
            title: "Authorize",
            heading: "Invalid magic link",
            bodyHtml: `<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`,
            hideLinksPanel: true,
          })
        );
    }
  });

  app.post("/credits/transfer/confirm", async (req: Request, res: Response) => {
    try {
      const actionId = String(
        req.body?.action_id ?? req.body?.actionId ?? req.query.action_id ?? ""
      ).trim();
      const code = String(req.body?.code ?? req.query.code ?? "").trim();
      const totp = String(req.body?.totp ?? "").trim();
      const result = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.confirmTransfer({
            actionId,
            code,
            ...(totp ? { totp } : {}),
          });
        })
      );
      res.type("html").send(
        renderCreditsTransferConfirmedHtml({
          fromTenantId: result.fromTenantId,
          toTenantId: result.toTenantId,
          amountUsd: result.amountCents / 100,
          transferId: result.transferId,
        })
      );
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(
          renderCreditsHateoasPage({
            title: "Authorize failed",
            heading: "Could not confirm",
            bodyHtml: `<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>
              <p class="note"><a href="/credits">Back home</a></p>`,
            hideLinksPanel: true,
          })
        );
    }
  });

  app.get("/credits/transfer/cancel", async (req: Request, res: Response) => {
    try {
      const actionId = String(req.query.action_id ?? req.query.actionId ?? "").trim();
      const code = String(req.query.code ?? "").trim();
      const record = await assertPendingCode(actionId, code);
      if (record.kind !== "credits_transfer") {
        throw new Error(`action is kind=${record.kind}; expected credits_transfer`);
      }
      if (record.status === "pending") {
        await savePendingAction({
          ...record,
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        });
      } else if (record.status === "executed") {
        throw new Error("Transfer already executed — cannot cancel");
      }
      res.type("html").send(renderCreditsTransferCancelledHtml(actionId));
    } catch (e) {
      res
        .status(400)
        .type("html")
        .send(
          renderCreditsHateoasPage({
            title: "Cancel failed",
            heading: "Could not cancel",
            bodyHtml: `<p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`,
            hideLinksPanel: true,
          })
        );
    }
  });

  app.get("/credits/request/new", (req: Request, res: Response) => {
    res.type("html").send(renderCreditsRequestComposeHtml(tenantFromQuery(req)));
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
      res.type("html").send(
        renderCreditsStagedTransferHtml({
          actionId: staged.actionId,
          confirmationCode: staged.confirmationCode,
          approvalUrl: buildCreditsTransferApproveUrl(
            staged.actionId,
            staged.confirmationCode
          ),
          totpRequired: staged.totpRequired,
          requestStatus: request.status,
        })
      );
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
