import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld, appendAudit, newId, redactPii } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      if (world.ipAllowlist && world.ipAllowlist.length > 0) {
        const ip =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip") ??
          "127.0.0.1";
        const okIp = world.ipAllowlist.some((rule) => {
          if (rule === "10.0.0.0/8") return ip.startsWith("10.");
          if (rule === "192.168.0.0/16") return ip.startsWith("192.168.");
          return ip === rule;
        });
        if (!okIp) {
          appendAudit("gateway", "ip.allowlist", "Refused — outside allowlist", { ip });
          return NextResponse.json({ error: "access from outside refused", ip }, { status: 403 });
        }
      }
      if (world.gateUnreachable) {
        appendAudit("gateway", "tool_gate.unreachable", "Refused — fail closed");
        return NextResponse.json({ error: "tool-call gate unreachable" }, { status: 503 });
      }
      if (world.hardStop && world.monthSpentCents >= world.monthBudgetCents) {
        return NextResponse.json({ error: "org hard stop — model calls paused" }, { status: 402 });
      }
      const key = yield* h.keyByBearer(req.headers.get("authorization"));
      if (!key || key.revoked) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      if (new Date(key.expiresAt).getTime() < Date.now()) {
        return NextResponse.json({ error: "key expired" }, { status: 401 });
      }
      if (!key.canUse.includes("models")) {
        return NextResponse.json({ error: "key cannot use models" }, { status: 403 });
      }
      if (key.teamBudgetExhausted) {
        return NextResponse.json({ error: "team budget exhausted" }, { status: 429 });
      }
      if (key.spentTodayCents >= key.dailyCapCents) {
        appendAudit(key.name, "budget.exhausted", "Daily cap reached");
        world.events.push({
          id: newId("evt"),
          type: "budget.exhausted",
          payload: { key: key.name },
          at: new Date().toISOString(),
        });
        return NextResponse.json(
          { error: "daily cap reached", capReached: true },
          { status: 429 },
        );
      }

      const body = (yield* Effect.tryPromise({
        try: () => req.json(),
        catch: () => ({}),
      })) as { model?: string; messages?: { content?: string }[] };
      const modelAlias = body.model ?? "standard";
      const route = world.modelRoutes[modelAlias] ?? world.modelRoutes.standard!;

      if (route.primaryBroken) {
        if (route.private) {
          appendAudit(key.name, "inference.chat", "Failed — private route, no outside provider");
          return NextResponse.json(
            { error: "private route unavailable; not sent outside" },
            { status: 503 },
          );
        }
        if (route.fallback) {
          route.usingFallback = true;
          route.fallbackCount += 1;
        } else {
          return NextResponse.json({ error: "provider unavailable" }, { status: 503 });
        }
      }

      const prompt = body.messages?.map((m) => m.content ?? "").join("\n") ?? "";
      const { text: redactedPrompt, redacted } = redactPii(prompt);

      // Capture proxy redaction for outside models
      if (!route.private && redacted) {
        appendAudit("capture-proxy", "redaction", "PII redacted before leaving", {
          email: /\[REDACTED_EMAIL\]/.test(redactedPrompt),
          phone: /\[REDACTED_PHONE\]/.test(redactedPrompt),
        });
      }

      let costCents = 2;
      if (world.creditsCents > 0) {
        const fromCredits = Math.min(world.creditsCents, costCents);
        world.creditsCents -= fromCredits;
        costCents -= fromCredits;
      }
      key.spentTodayCents += 2;
      world.monthSpentCents += 2;
      if (world.teamBudgets[key.group]) {
        world.teamBudgets[key.group]!.spent += 2;
      }

      const resolvedModel = route.usingFallback
        ? route.fallback!
        : route.primary;

      let memoryIds: string[] | undefined;
      if (key.memoryEnrichment && key.canUse.includes("memory")) {
        memoryIds = world.memoryNotes.filter((n) => !n.erased && !n.personal).map((n) => n.id);
        appendAudit(key.name, "inference.memory", "enrichment", { memoryIds });
      }

      const sessionId = newId("sess");
      // Resume same session if client retries (RES-01)
      const existing = world.sessions.find((s) => s.keyName === key.name && !s.upload);
      const sid = existing?.id ?? sessionId;
      if (!existing) {
        world.sessions.push({
          id: sid,
          keyName: key.name,
          model: resolvedModel,
          spendCents: 2,
        });
      } else {
        existing.spendCents += 2;
        existing.model = resolvedModel;
      }

      appendAudit(key.name, "inference.chat", "ok", {
        sessionId: sid,
        model: resolvedModel,
        alias: modelAlias,
        redacted,
        usingFallback: route.usingFallback,
      });

      return NextResponse.json({
        id: newId("chat"),
        object: "chat.completion",
        model: resolvedModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `OK (${resolvedModel}). Prompt stored as: ${redactedPrompt.slice(0, 200)}`,
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        clawql: {
          sessionId: sid,
          costCents: 2,
          redacted,
          usingFallback: route.usingFallback,
          fallbackCount: route.fallbackCount,
          routeStatus: route.usingFallback ? "Using fallback" : "Primary",
          memoryIds: memoryIds ?? null,
        },
      });
    }),
  );
}
