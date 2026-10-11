import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/** Public skills list/actions for catalog Pass-when (not control/getWitness). */
export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        skills: world.skills.map((s) => ({
          id: s.id,
          name: s.name,
          stage: s.stage,
          failed: s.failed ?? false,
          failReason: s.failReason,
          sessionCount: s.sessionCount,
          evidence: s.evidence ?? [],
          hosts: s.hosts ?? [],
          ops: s.ops ?? [],
          injectionFlagged: s.injectionFlagged ?? false,
          needsConnection: s.needsConnection,
          retireReason: s.retireReason,
          reReviewLapsed: s.reReviewLapsed ?? false,
          writing: s.writing ?? false,
          canSendToReview: s.stage === "proving" && !s.failed && !s.injectionFlagged && !s.needsConnection,
        })),
      });
    }),
  );
}

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
            action?:
              | "propose"
              | "prove"
              | "autoPromote"
              | "reprove"
              | "retire"
              | "flagInjection"
              | "promote"
              | "mutate";
            name?: string;
            sessionCount?: number;
            id?: string;
            reason?: string;
            actor?: string;
            evidence?: string[];
            needsConnection?: string;
            writing?: boolean;
            hosts?: string[];
            ops?: string[];
            stage?: "proposed" | "proving" | "review" | "active" | "retired";
            retireReason?: string;
            reReviewLapsed?: boolean;
            failed?: boolean;
            failReason?: string;
          }>,
        catch: () => ({}),
      })) as {
        action?: string;
        name?: string;
        sessionCount?: number;
        id?: string;
        reason?: string;
        actor?: string;
        evidence?: string[];
        needsConnection?: string;
        writing?: boolean;
        hosts?: string[];
        ops?: string[];
        stage?: "proposed" | "proving" | "review" | "active" | "retired";
        retireReason?: string;
        reReviewLapsed?: boolean;
        failed?: boolean;
        failReason?: string;
      };

      if (body.action === "propose") {
        const id = newId("skl");
        const skill = {
          id,
          name: body.name ?? id,
          stage: "proposed" as const,
          sessionCount: body.sessionCount ?? 1,
          writing: body.writing,
          hosts: body.hosts,
          ops: body.ops,
          needsConnection: body.needsConnection,
        };
        world.skills.push(skill);
        appendAudit(body.actor ?? "system", "skill.propose", "Proposed", {
          id,
          name: skill.name,
          sessionCount: skill.sessionCount,
        });
        return NextResponse.json({ ok: true, skill });
      }

      const id = body.id;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let skill = world.skills.find((s) => s.id === id);
      if (!skill) {
        skill = {
          id,
          name: id,
          stage: "proposed",
        };
        world.skills.push(skill);
      }

      switch (body.action) {
        case "mutate": {
          if (body.name !== undefined) skill.name = body.name;
          if (body.stage !== undefined) skill.stage = body.stage;
          if (body.evidence !== undefined) skill.evidence = body.evidence;
          if (body.needsConnection !== undefined) skill.needsConnection = body.needsConnection;
          if (body.writing !== undefined) skill.writing = body.writing;
          if (body.hosts !== undefined) skill.hosts = body.hosts;
          if (body.ops !== undefined) skill.ops = body.ops;
          if (body.retireReason !== undefined) skill.retireReason = body.retireReason;
          if (body.reReviewLapsed !== undefined) skill.reReviewLapsed = body.reReviewLapsed;
          if (body.failed !== undefined) skill.failed = body.failed;
          if (body.failReason !== undefined) skill.failReason = body.failReason;
          if (body.sessionCount !== undefined) skill.sessionCount = body.sessionCount;
          appendAudit(body.actor ?? "system", "skill.mutate", "Updated", { id });
          break;
        }
        case "prove": {
          skill.stage = "proving";
          skill.evidence = body.evidence ?? [
            "unit",
            "integration",
            "adversarial",
            "trace",
            "review",
          ];
          appendAudit(body.actor ?? "system", "skill.prove", "Moved to proving", { id });
          break;
        }
        case "autoPromote": {
          skill.stage = "active";
          skill.evidence =
            body.evidence ??
            skill.evidence ?? ["unit", "integration", "adversarial", "trace", "review"];
          appendAudit(body.actor ?? "system", "skill.auto_promote", "Active — read-only", { id });
          break;
        }
        case "promote": {
          if (skill.failed || skill.injectionFlagged || skill.needsConnection) {
            return NextResponse.json({ error: "cannot promote" }, { status: 403 });
          }
          skill.stage = "review";
          world.review.push({
            id: newId("rev"),
            kind: "skill",
            title: `Promote skill ${skill.name}`,
            requester: body.actor ?? "Dana Reyes",
            digest: id,
            args: { skillId: id },
            status: "waiting",
            approvers: [],
            expiresAt: new Date(Date.now() + world.requestExpiryMinutes * 60_000).toISOString(),
          });
          appendAudit(body.actor ?? "Dana Reyes", "skill.promote", "Sent to Review", { id });
          break;
        }
        case "reprove": {
          skill.stage = "proving";
          skill.evidence = [];
          skill.retireReason = undefined;
          appendAudit(body.actor ?? "system", "skill.reprove", "Back to proving — no evidence carried", {
            id,
          });
          break;
        }
        case "retire": {
          skill.stage = "retired";
          skill.retireReason = body.reason ?? "owner request";
          appendAudit(body.actor ?? "Dana Reyes", "skill.retire", skill.retireReason, { id });
          break;
        }
        case "flagInjection": {
          skill.injectionFlagged = true;
          skill.failed = true;
          skill.failReason = "Injection scan flagged";
          appendAudit("system", "skill.injection", "Flagged — cannot promote", { id });
          break;
        }
        default:
          return NextResponse.json({ error: "unknown action" }, { status: 400 });
      }

      return NextResponse.json({ ok: true, skill });
    }),
  );
}
