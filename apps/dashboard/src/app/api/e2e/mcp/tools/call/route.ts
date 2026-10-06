import { createHash } from "node:crypto";

import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  getWorld,
  newId,
  pushEvent,
  recountReviewBadges,
} from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      if (world.gateUnreachable) {
        appendAudit("gateway", "tool_gate.unreachable", "Refused — fail closed");
        return NextResponse.json({ error: "tool-call gate unreachable" }, { status: 503 });
      }
      const key = yield* h.keyByBearer(req.headers.get("authorization"));
      if (!key || key.revoked) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      if (new Date(key.expiresAt).getTime() < Date.now()) {
        return NextResponse.json({ error: "key expired" }, { status: 401 });
      }
      if (!key.canUse.includes("tools")) {
        return NextResponse.json({ error: "key cannot use tools" }, { status: 403 });
      }
      if (key.teamBudgetExhausted) {
        return NextResponse.json({ error: "team budget exhausted" }, { status: 429 });
      }

      const body = (yield* Effect.tryPromise({
        try: () => req.json() as Promise<{ name?: string; arguments?: Record<string, unknown> }>,
        catch: () => ({ name: "", arguments: {} }),
      })) as { name?: string; arguments?: Record<string, unknown> };

      const name = body.name ?? "";
      const args = body.arguments ?? {};

      // Retired / non-runnable skills cannot execute (SK-10)
      const skillIdEarly = String(args.skillId ?? "");
      if (skillIdEarly) {
        const skillEarly = world.skills.find((s) => s.id === skillIdEarly);
        if (skillEarly && (skillEarly.stage === "retired" || skillEarly.failed || skillEarly.injectionFlagged)) {
          appendAudit(key.name, name, "Refused — skill not runnable", {
            skillId: skillIdEarly,
            stage: skillEarly.stage,
          });
          return NextResponse.json(
            { error: "skill cannot run", stage: skillEarly.stage, reason: skillEarly.retireReason },
            { status: 403 },
          );
        }
      }

      if (name === "approve" || name === "review_approve") {
        appendAudit(key.name, "approve.attempt", "No agent tool can approve");
        return NextResponse.json({ error: "approvals are not an agent tool" }, { status: 403 });
      }

      // Credential / env reveal blocked (CON-15, SEC-06)
      if (
        name.includes("env") ||
        name.includes("credential") ||
        name.includes("secret") ||
        /print.*(token|cookie|env)/i.test(String(args.prompt ?? args.query ?? ""))
      ) {
        appendAudit(key.name, name || "reveal", "Blocked — no secrets exposed");
        return NextResponse.json({
          ok: false,
          error: "Nothing secret appears",
          result: { redacted: true },
        });
      }

      // Personal GitHub → Slack blocked (SEC-12, CON-06)
      if (
        (name.includes("slack") || args.channel === "company-slack") &&
        (args.source === "personal-github" || args.from === "dana-personal-github")
      ) {
        appendAudit(key.name, name, "Blocked by information-flow policy");
        pushEvent("hook.blocked", { name, reason: "personal→company" });
        return NextResponse.json({ error: "Blocked by information-flow policy" }, { status: 403 });
      }

      if (world.infoFlowUnreachable && (name.includes("email") || name.includes("slack") || name.includes("transfer"))) {
        appendAudit(key.name, name, "Refused — information-flow policy unreachable");
        return NextResponse.json({ error: "information-flow policy unreachable" }, { status: 503 });
      }

      // Blocked deletes / payments (REV-21, SEC-01, SEC-03)
      if (
        name.includes("delete") ||
        name.includes("payments.transfer") ||
        name === "payments.transfer" ||
        name === "email.send" ||
        name.startsWith("payments.")
      ) {
        const reason =
          name === "email.send" ? "Blocked by information flow" : "Blocked by policy";
        appendAudit(key.name, name, reason);
        pushEvent("hook.blocked", { name, reason });
        return NextResponse.json({ error: reason, event: "hook.blocked" }, { status: 403 });
      }

      // Outbound host allowlist (ADM-16, SK-16)
      const host = String(args.host ?? args.url ?? "");
      if (host) {
        try {
          const u = new URL(host.includes("://") ? host : `https://${host}`);
          if (!world.allowedOutboundHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
            world.blockedCalls.push({
              host: u.hostname,
              reason: "not on allowed outbound list",
              at: new Date().toISOString(),
            });
            appendAudit(key.name, name, "Blocked — undeclared/disallowed host", {
              host: u.hostname,
            });
            // Skill runtime undeclared host → retire
            const skillId = String(args.skillId ?? "");
            const skill = world.skills.find((s) => s.id === skillId && s.stage === "active");
            if (skill && !(skill.hosts ?? []).includes(u.hostname)) {
              skill.stage = "retired";
              skill.retireReason = "undeclared host at runtime";
            }
            return NextResponse.json({ error: "host not allowed" }, { status: 403 });
          }
          // Skill calling unapproved op
          const skillId = String(args.skillId ?? "");
          const skill = world.skills.find((s) => s.id === skillId && s.stage === "active");
          if (skill && skill.ops && !skill.ops.includes(name)) {
            skill.stage = "retired";
            skill.retireReason = "called operation never approved";
            appendAudit(key.name, name, "Skill retired — unapproved operation");
            return NextResponse.json({ error: "operation not approved for skill" }, { status: 403 });
          }
        } catch {
          /* ignore */
        }
      }

      // Support key cannot call GitHub (GW-15)
      if (
        key.group === "Support" &&
        (name.startsWith("github.") || String(args.host ?? "").includes("api.github.com"))
      ) {
        appendAudit(key.name, name, "Refused — not in Support key group");
        return NextResponse.json({ error: "GitHub not in Support key group" }, { status: 403 });
      }

      // Stripe removed from Support (CON-14)
      if (
        key.group === "Support" &&
        (name.startsWith("stripe.") || String(args.host ?? "").includes("api.stripe.com"))
      ) {
        const stripe = world.connections.find((c) => c.id === "stripe");
        if (stripe && !stripe.groups.includes("Support")) {
          appendAudit(key.name, name, "Refused — Stripe removed from Support");
          return NextResponse.json({ error: "Stripe not in Support key group" }, { status: 403 });
        }
      }

      // Connection must be in key group (CON-02, GW-15)
      if (name.startsWith("jira.") || args.connection === "jira") {
        const jira = world.connections.find((c) => c.id === "jira");
        if (jira && !jira.groups.includes(key.group)) {
          return NextResponse.json({ error: "connection not in key group" }, { status: 403 });
        }
        // Read override (CON-03)
        if (name === "jira.search" || args.path === "POST /search") {
          if (jira?.readOverrides?.includes("POST /search")) {
            appendAudit(key.name, name, "Allowed as read override");
            return NextResponse.json({ ok: true, results: [] });
          }
        }
        if (name.includes("delete")) {
          return NextResponse.json({ error: "deletes blocked" }, { status: 403 });
        }
        if (name.includes("write") || name.includes("create") || name.includes("update")) {
          const reqId = newId("rev");
          const digest = createHash("sha256").update(JSON.stringify(args)).digest("hex");
          world.review.push({
            id: reqId,
            kind: "change",
            title: "Jira write",
            requester: key.name,
            digest,
            args: { ...args, connection: "jira" },
            status: "waiting",
            approvers: [],
            expiresAt: new Date(Date.now() + world.requestExpiryMinutes * 60_000).toISOString(),
          });
          recountReviewBadges();
          appendAudit(key.name, name, "Mandate requested", { requestId: reqId });
          return NextResponse.json(
            { error: "mandate required", requestId: reqId, digest },
            { status: 402 },
          );
        }
      }

      // Invalid numeric (SEC-13)
      if (
        ("annualValue" in args && (typeof args.annualValue !== "number" || Number(args.annualValue) < 0)) ||
        ("budget" in args && (typeof args.budget !== "number" || Number(args.budget) < 0))
      ) {
        appendAudit(key.name, name, "Rejected — invalid numeric");
        return NextResponse.json({ error: "invalid numeric value" }, { status: 400 });
      }

      // Inbound untrusted transfer attempt (EV-18)
      if (args.fromInbound || args.untrusted) {
        if (name.includes("transfer") || name.includes("payment")) {
          appendAudit(key.name, name, "Blocked — inbound treated as data");
          pushEvent("hook.blocked", { name, reason: "untrusted inbound" });
          return NextResponse.json({ error: "blocked untrusted inbound action" }, { status: 403 });
        }
      }

      // Memory via tool
      if (name === "memory_search" || name === "memory.search") {
        if (!key.canUse.includes("memory")) {
          appendAudit(key.name, name, "Refused — key can't use memory");
          return NextResponse.json({ error: "key cannot use memory" }, { status: 403 });
        }
        const ids = world.memoryNotes.filter((n) => !n.erased && !n.personal).map((n) => n.id);
        return NextResponse.json({ ok: true, memoryIds: ids });
      }

      // Contract value change → Review (REV-01)
      if (name === "adjust_contract_value" || name === "crm.contracts.adjust") {
        const digest = createHash("sha256").update(JSON.stringify(args)).digest("hex");
        // REV-06: expired request with same digest refuses write; CRM unchanged
        const expiredMatch = world.review.find((r) => r.digest === digest && r.status === "expired");
        if (expiredMatch) {
          appendAudit(key.name, name, "Refused — request expired", { requestId: expiredMatch.id, digest });
          return NextResponse.json(
            { error: "mandate refused — request expired", requestId: expiredMatch.id },
            { status: 402 },
          );
        }
        if (new Date(world.review.find((r) => r.id === "rev_change")?.expiresAt ?? 0).getTime() < Date.now()) {
          const expired = world.review.find((r) => r.id === "rev_change");
          if (expired?.status === "expired") {
            return NextResponse.json({ error: "mandate refused — request expired" }, { status: 402 });
          }
        }
        const existingMandate = world.review.find(
          (r) => r.digest === digest && r.status === "approved" && r.mandateId,
        );
        if (existingMandate?.mandateId) {
          const contractId = String(args.contract ?? "northwind");
          const value = Number(args.annualValue ?? args.value ?? 0);
          if (world.crm[contractId]) {
            world.crm[contractId]!.annualValue = value;
          }
          const mandateId = existingMandate.mandateId;
          existingMandate.mandateId = undefined;
          appendAudit(key.name, name, "write succeeded once", { mandateId, digest });
          return NextResponse.json({ ok: true, mandateId, used: true });
        }
        // Also match seeded rev_change by approving that digest
        const seeded = world.review.find(
          (r) => r.id === "rev_change" && r.status === "approved" && r.mandateId,
        );
        if (seeded?.mandateId && seeded.digest === digest) {
          const contractId = String(args.contract ?? "northwind");
          const value = Number(args.annualValue ?? args.value ?? 0);
          if (world.crm[contractId]) world.crm[contractId]!.annualValue = value;
          const mandateId = seeded.mandateId;
          seeded.mandateId = undefined;
          appendAudit(key.name, name, "write succeeded once", { mandateId, digest });
          return NextResponse.json({ ok: true, mandateId, used: true });
        }

        const reqId = newId("rev");
        world.review.push({
          id: reqId,
          kind: "change",
          title: "Change a contract's value",
          requester: key.name,
          digest,
          args,
          status: "waiting",
          approvers: [],
          expiresAt: new Date(Date.now() + world.requestExpiryMinutes * 60_000).toISOString(),
          requiredApprovals: world.requiredApprovalsDefault,
        });
        recountReviewBadges();
        appendAudit(key.name, name, "Mandate requested", { requestId: reqId, digest });
        return NextResponse.json(
          { error: "mandate required", requestId: reqId, digest },
          { status: 402 },
        );
      }

      // Skill write still needs mandate (SK-05)
      if (args.skillId && (name.includes("write") || name.includes("adjust"))) {
        const reqId = newId("rev");
        world.review.push({
          id: reqId,
          kind: "change",
          title: "Skill write",
          requester: key.name,
          digest: createHash("sha256").update(JSON.stringify(args)).digest("hex"),
          args,
          status: "waiting",
          approvers: [],
          expiresAt: new Date(Date.now() + world.requestExpiryMinutes * 60_000).toISOString(),
        });
        recountReviewBadges();
        return NextResponse.json({ error: "mandate required", requestId: reqId }, { status: 402 });
      }

      if (name === "sources_propose") {
        const reqId = newId("rev");
        world.review.push({
          id: reqId,
          kind: "source",
          title: `Add the ${String(args.name ?? "API")} API`,
          requester: key.name,
          digest: createHash("sha256").update(JSON.stringify(args)).digest("hex"),
          args,
          status: "waiting",
          approvers: [],
          expiresAt: new Date(Date.now() + 864e5).toISOString(),
        });
        recountReviewBadges();
        appendAudit(key.name, "sources_propose", "Proposed", { requestId: reqId });
        return NextResponse.json({ ok: true, requestId: reqId, needsApproval: true });
      }

      if (name === "search") {
        const q = String(args.query ?? "");
        const needsMandate = /write|adjust|post|create/i.test(q);
        return NextResponse.json({
          results: [
            {
              operationId: q || "crm.contracts.get",
              risk: needsMandate ? "MEDIUM" : "LOW",
              needsMandate,
            },
          ],
        });
      }

      // Schedule run (EV-19)
      if (name === "schedule.run" || name === "schedule_run") {
        const evt = pushEvent("schedule.completed", { output: args.output ?? "ok" });
        if (args.write) {
          return NextResponse.json({
            ok: true,
            eventId: evt.id,
            write: "waiting for mandate",
          });
        }
        return NextResponse.json({ ok: true, eventId: evt.id });
      }

      appendAudit(key.name, name || "execute", "Allowed");
      return NextResponse.json({ ok: true, result: args });
    }),
  );
}
