/**
 * Decision sites for Cloud E2E (pii-check, tool-routing, ticket-triage).
 * Production-shaped POST/GET /decision — Pass-when via /audit (+ gateway counts).
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, recountReviewBadges } from "@/lib/managed/e2e/world";

export function postDecision(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const key = yield* h.keyByBearer(req.headers.get("authorization"));
    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          site?: string;
          text?: string;
          question?: string;
          answer?: string;
          actor?: string;
          skip?: boolean;
          askTeammate?: string;
        }>,
      catch: () => ({}),
    })) as {
      site?: string;
      text?: string;
      question?: string;
      answer?: string;
      actor?: string;
      skip?: boolean;
      askTeammate?: string;
    };

    const site = body.site ?? "pii-check";
    const q = (body.question ?? body.text ?? "").toLowerCase();
    if (/\bscore\b/.test(q) || q.includes("rate from")) {
      return NextResponse.json(
        { error: "use choice or noul", message: "use choice or noul" },
        { status: 400 },
      );
    }

    const cfg = world.decisionSites[site] ?? {
      mode: "trusted" as const,
      count7d: 0,
      labels: {},
    };
    world.decisionSites[site] = cfg;
    cfg.count7d += 1;

    if (body.skip) {
      world.notificationsOutbox.push({
        to: body.askTeammate ?? "teammate",
        channel: "push",
        body: `Please answer ${site}`,
      });
      appendAudit(body.actor ?? "Jordan Park", "decision.skip", "Skipped; teammate notified");
      return NextResponse.json({ ok: true, status: "waiting", notified: body.askTeammate });
    }

    if (site === "tool-routing" || cfg.mode === "reproving") {
      cfg.labels.escalate = (cfg.labels.escalate ?? 0) + 1;
      return NextResponse.json({
        calibrated: false,
        escalate: true,
        site,
        count7d: cfg.count7d,
      });
    }

    if (site === "pii-check") {
      const text = body.text ?? "";
      const borderline = /maybe|possible|unsure|borderline/i.test(text);
      if (borderline) {
        cfg.labels.escalate = (cfg.labels.escalate ?? 0) + 1;
        return NextResponse.json({
          calibrated: true,
          escalate: true,
          label: "escalate",
          count7d: cfg.count7d,
        });
      }
      cfg.labels.clear = (cfg.labels.clear ?? 0) + 1;
      return NextResponse.json({
        calibrated: true,
        escalate: false,
        label: "clear",
        count7d: cfg.count7d,
      });
    }

    if (site === "ticket-triage" && body.answer) {
      const actor = body.actor ?? "Jordan Park";
      const person = world.people.find((p) => p.name === actor);
      if (person && !person.active) {
        appendAudit(actor, "decision.answer", "Refused — person deactivated");
        return NextResponse.json({ error: "person deactivated" }, { status: 403 });
      }
      if (person && !person.canAnswerTicketTriage) {
        appendAudit(actor, "decision.answer", "Refused — not allowed to answer ticket-triage", {
          site,
        });
        return NextResponse.json({ error: "not allowed to answer ticket-triage" }, { status: 403 });
      }
      cfg.labels[body.answer] = (cfg.labels[body.answer] ?? 0) + 1;
      const item = world.review.find((r) => r.kind === "decision" && r.status === "waiting");
      if (item) {
        item.status = "approved";
        item.approvers = [actor];
      }
      recountReviewBadges();
      appendAudit(actor, "decision.answer", body.answer, { site, ticket: item?.args.ticket });
      return NextResponse.json({
        ok: true,
        queue: body.answer === "Refund request" ? "refunds" : "billing",
        labelCount: cfg.labels[body.answer],
        count7d: cfg.count7d,
      });
    }

    void key;
    return NextResponse.json({ ok: true, site, count7d: cfg.count7d, calibrated: true });
  });
}

/** Decision-site counts for GW-14 Pass-when. */
export function getDecision(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const url = new URL(req.url);
    if (url.searchParams.get("question")?.toLowerCase().includes("score")) {
      return NextResponse.json(
        { error: "use choice or noul", message: "use choice or noul" },
        { status: 400 },
      );
    }
    const world = getWorld();
    return NextResponse.json({
      ok: true,
      sites: world.decisionSites,
    });
  });
}
