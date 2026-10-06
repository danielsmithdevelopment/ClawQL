import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  getWorld,
  newId,
  personByName,
  recountReviewBadges,
} from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/**
 * Person approval surface (not an agent tool).
 * Body: { requestId, actor, keyKind, pinVerified, aaguid, signatureCounter, signedPayload }
 */
export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const body = (yield* Effect.tryPromise({
        try: () =>
          req.json() as Promise<{
            requestId?: string;
            actor?: string;
            keyKind?: string;
            pinVerified?: boolean;
            approve?: boolean;
            reason?: string;
            note?: string;
            aaguid?: string;
            signatureCounter?: number;
            signedPayload?: string;
            cancel?: boolean;
            onlyWhatICanApprove?: boolean;
          }>,
        catch: () => ({}),
      })) as {
        requestId?: string;
        actor?: string;
        keyKind?: string;
        pinVerified?: boolean;
        approve?: boolean;
        reason?: string;
        note?: string;
        aaguid?: string;
        signatureCounter?: number;
        signedPayload?: string;
        cancel?: boolean;
        onlyWhatICanApprove?: boolean;
      };

      const actor = body.actor ?? "Dana Reyes";
      if (body.cancel) {
        appendAudit(actor, "review.approve", "Cancelled at key prompt — no change");
        return NextResponse.json({ ok: true, cancelled: true });
      }

      const item = world.review.find((r) => r.id === body.requestId);
      if (!item) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      if (item.status === "expired") {
        return NextResponse.json({ error: "request expired" }, { status: 409 });
      }
      if (item.status !== "waiting" && item.status !== "changed") {
        return NextResponse.json({ error: `request is ${item.status}` }, { status: 409 });
      }

      const person = personByName(actor);
      if (person?.role === "auditor") {
        return NextResponse.json({ error: "auditor cannot approve" }, { status: 403 });
      }

      const requesterPerson = String(item.args.forUser ?? item.requester);
      if (actor === item.requester || actor === requesterPerson) {
        appendAudit(actor, "review.approve", "Blocked — requester cannot approve");
        return NextResponse.json({ error: "requester cannot approve" }, { status: 403 });
      }

      if (item.kind === "change") {
        const canApprove =
          person?.canApproveContracts || actor === "Dana Reyes" || actor === "Marcus Lee";
        if (!canApprove) {
          appendAudit(actor, "review.approve", "Blocked — not an approver");
          if (body.onlyWhatICanApprove) {
            return NextResponse.json({
              error: "not an approver for this request",
              hidden: true,
              visible: false,
            });
          }
          return NextResponse.json(
            { error: "not an approver for this request", canSee: true, canApprove: false },
            { status: 403 },
          );
        }
      }

      if (body.keyKind === "synced" || body.keyKind === "totp") {
        appendAudit(actor, "review.approve", "That key can't approve");
        return NextResponse.json({ error: "That key can't approve" }, { status: 403 });
      }
      if (body.pinVerified === false) {
        appendAudit(actor, "review.approve", "Rejected — needs PIN or fingerprint");
        return NextResponse.json({ error: "user verification required" }, { status: 403 });
      }

      const aaguid = body.aaguid ?? person?.securityKeys.find((k) => k.canApprove)?.aaguid;
      if (aaguid && !world.allowedAuthenticatorAaguids.includes(aaguid)) {
        appendAudit(actor, "review.approve", "Approval refused — authenticator not allowed", {
          aaguid,
        });
        return NextResponse.json({ error: "authenticator model not allowed" }, { status: 403 });
      }

      const sk = person?.securityKeys.find((k) => k.canApprove && !k.revoked);
      if (sk && typeof body.signatureCounter === "number") {
        if (body.signatureCounter < sk.signatureCounter) {
          appendAudit(actor, "security_key.clone", "Possible cloned key", {
            expected: sk.signatureCounter,
            got: body.signatureCounter,
          });
          return NextResponse.json({ error: "possible cloned key" }, { status: 403 });
        }
        sk.signatureCounter = body.signatureCounter;
      }

      if (body.signedPayload) {
        if (world.usedApprovalPayloads.has(body.signedPayload)) {
          appendAudit(actor, "review.approve", "Replay rejected — no second mandate");
          return NextResponse.json({ error: "replay rejected" }, { status: 403 });
        }
        world.usedApprovalPayloads.add(body.signedPayload);
      }

      if (body.approve === false) {
        item.status = "declined";
        item.declineReason = body.reason ?? "declined";
        item.declineNote = body.note;
        appendAudit(actor, "review.decline", body.reason ?? "declined", {
          requestId: item.id,
          note: body.note,
        });
        recountReviewBadges();
        return NextResponse.json({ ok: true, status: "declined", reason: item.declineReason });
      }

      // Dual approval
      const required = item.requiredApprovals ?? world.requiredApprovalsDefault;
      if (item.approvers.includes(actor)) {
        appendAudit(actor, "review.approve", "Second approval from same person refused");
        return NextResponse.json({ error: "already approved by this person" }, { status: 403 });
      }
      item.approvers = [...item.approvers, actor];
      if (item.approvers.length < required) {
        appendAudit(actor, "review.approve", "Partial approval", {
          requestId: item.id,
          have: item.approvers.length,
          need: required,
        });
        return NextResponse.json({
          ok: true,
          status: "waiting",
          partial: true,
          approvers: item.approvers,
        });
      }

      const mandateId = newId("man");
      item.status = "approved";
      item.mandateId = mandateId;
      appendAudit(actor, "review.approve", "Mandate issued", {
        requestId: item.id,
        mandateId,
        digest: item.digest,
      });

      if (item.kind === "source") {
        const name = String(item.args.name ?? item.args.source ?? "Linear");
        const existing = world.connections.find((c) => c.id === name.toLowerCase());
        if (existing) {
          existing.status = "connected";
          existing.groups = [];
        } else {
          world.connections.push({
            id: name.toLowerCase(),
            name,
            groups: [],
            status: "connected",
          });
        }
      }

      if (item.kind === "skill") {
        const skill = world.skills.find((s) => s.id === item.args.skillId);
        if (skill) {
          skill.stage = "active";
          appendAudit(actor, "skill.promote", "Active", { skillId: skill.id });
        }
      }

      recountReviewBadges();
      return NextResponse.json({
        ok: true,
        mandateId,
        digest: item.digest,
        status: "approved",
      });
    }),
  );
}

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        review: world.review,
        badges: {
          home: world.homeNeedsAction,
          review: world.reviewBadge,
          sidebar: world.sidebarBadge,
        },
      });
    }),
  );
}
