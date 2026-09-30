import { createServer } from "node:http";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { BUILTIN_MCP_EVENT_CATALOG, DEFERRED_MCP_EVENT_CATALOG } from "./catalog.js";
import { hostMatchesAllowlist } from "./enterprise.js";
import {
  emitBudgetExhaustedAwait,
  emitDocumentProcessedAwait,
  emitHookBlockedAwait,
  emitNotificationSentAwait,
  emitScheduleCompletedAwait,
  emitStreamChangedAwait,
} from "./producers.js";
import { setMcpEventsProcessEmitter } from "./process-bridge.js";
import { generateWhsecSecretSync } from "./secret.js";
import {
  McpEventsService,
  McpEventsServiceLayer,
  runMcpEventsEffect,
} from "./service.js";
import { createMemorySubscriptionStore } from "./store.js";

function startEchoReceiver(): Promise<{
  url: string;
  close: () => Promise<void>;
  events: unknown[];
}> {
  const events: unknown[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      if (parsed.type === "verification") {
        res.statusCode = 200;
        res.end(JSON.stringify({ challenge: parsed.challenge }));
        return;
      }
      events.push(parsed);
      res.statusCode = 200;
      res.end("ok");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no addr");
      resolve({
        url: `http://127.0.0.1:${addr.port}/callback`,
        close: () =>
          new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
        events,
      });
    });
  });
}

describe("MCP Events producers (no vapor)", () => {
  const prevLocal = process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST;
  afterEach(() => {
    setMcpEventsProcessEmitter(null);
    if (prevLocal === undefined) delete process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST;
    else process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST = prevLocal;
  });

  it("advertises stream.changed and has empty deferred catalog", () => {
    expect(BUILTIN_MCP_EVENT_CATALOG.some((e) => e.name === "stream.changed")).toBe(true);
    expect(BUILTIN_MCP_EVENT_CATALOG.some((e) => e.name === "schedule.completed")).toBe(true);
    expect(BUILTIN_MCP_EVENT_CATALOG.some((e) => e.name === "notification.sent")).toBe(true);
    expect(BUILTIN_MCP_EVENT_CATALOG.some((e) => e.name === "mandate.completed")).toBe(false);
    expect(BUILTIN_MCP_EVENT_CATALOG.some((e) => e.name === "clawql.notification")).toBe(false);
    expect(DEFERRED_MCP_EVENT_CATALOG).toHaveLength(0);
  });

  it("allowlist matches exact and wildcard hosts", () => {
    expect(hostMatchesAllowlist("chatgpt.com", ["chatgpt.com"])).toBe(true);
    expect(hostMatchesAllowlist("foo.oaiusercontent.com", ["*.oaiusercontent.com"])).toBe(true);
    expect(hostMatchesAllowlist("evil.example", ["chatgpt.com"])).toBe(false);
    expect(hostMatchesAllowlist("evil.example", [])).toBe(true);
  });

  const cases: Array<{
    name: string;
    subscribeArgs: Record<string, unknown>;
    trigger: () => Promise<readonly { accepted: boolean }[]>;
    expectData: (data: Record<string, unknown>) => void;
  }> = [
    {
      name: "stream.changed",
      subscribeArgs: { topic: "job_stream_1" },
      trigger: () =>
        emitStreamChangedAwait({
          topic: "job_stream_1",
          summary: "1 changed",
          cursor: "abc",
          diff: {
            added: [],
            removed: [],
            changed: [{ path: "state", before: "open", after: "closed" }],
            truncated: false,
          },
          watch_fields: ["title", "state"],
          projection_tool: "schedule",
        }),
      expectData: (d) => {
        expect(d.topic).toBe("job_stream_1");
        expect(d.summary).toBe("1 changed");
        expect(d.diff).toBeTruthy();
        expect(d.projection_tool).toBe("schedule");
      },
    },
    {
      name: "document.processed",
      subscribeArgs: { document_id: "doc_live_1" },
      trigger: () =>
        emitDocumentProcessedAwait({
          document_id: "doc_live_1",
          status: "completed",
          summary: "ok",
        }),
      expectData: (d) => {
        expect(d.document_id).toBe("doc_live_1");
        expect(d.status).toBe("completed");
      },
    },
    {
      name: "hook.blocked",
      subscribeArgs: { tool: "execute" },
      trigger: () =>
        emitHookBlockedAwait({
          tool: "execute",
          reason: "ATR denied",
          session_id: "s1",
        }),
      expectData: (d) => {
        expect(d.tool).toBe("execute");
        expect(d.reason).toBe("ATR denied");
      },
    },
    {
      name: "budget.exhausted",
      subscribeArgs: { budget_id: "vk_1" },
      trigger: () =>
        emitBudgetExhaustedAwait({
          budget_id: "vk_1",
          scope: "team-a",
        }),
      expectData: (d) => {
        expect(d.budget_id).toBe("vk_1");
        expect(d.exhausted_at).toBeTruthy();
      },
    },
    {
      name: "schedule.completed",
      subscribeArgs: { schedule_id: "job_1" },
      trigger: () =>
        emitScheduleCompletedAwait({
          schedule_id: "job_1",
          status: "ok",
          summary: "done",
        }),
      expectData: (d) => {
        expect(d.schedule_id).toBe("job_1");
        expect(d.status).toBe("ok");
      },
    },
    {
      name: "notification.sent",
      subscribeArgs: { channel: "#ops" },
      trigger: () =>
        emitNotificationSentAwait({
          channel: "#ops",
          text: "hello ops",
        }),
      expectData: (d) => {
        expect(d.channel).toBe("#ops");
        expect(d.text).toBe("hello ops");
      },
    },
  ];

  for (const c of cases) {
    it(`producer → signed delivery for ${c.name}`, async () => {
      process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST = "1";
      const receiver = await startEchoReceiver();
      const secret = generateWhsecSecretSync();
      const store = createMemorySubscriptionStore();
      const enterprise = {
        callbackAllowlist: [] as string[],
        maxSubscriptionsPerPrincipal: 25,
        maxDeliveriesPerMinutePerPrincipal: 120,
        redactPii: false,
      };
      const layer = McpEventsServiceLayer({ store, enterprise });

      setMcpEventsProcessEmitter(async (event) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* McpEventsService;
            return yield* svc.emit(event);
          }).pipe(Effect.provide(layer))
        )
      );

      try {
        await runMcpEventsEffect(
          Effect.gen(function* () {
            const svc = yield* McpEventsService;
            return yield* svc.subscribe({
              principal: "tester",
              name: c.name,
              arguments: c.subscribeArgs,
              delivery: { mode: "webhook", url: receiver.url, secret },
            });
          }),
          { store, enterprise }
        );

        if (c.name === "document.processed") {
          await emitDocumentProcessedAwait({
            document_id: "other_doc",
            status: "completed",
          });
          expect(receiver.events).toHaveLength(0);
        }

        const outcomes = await c.trigger();
        expect(outcomes.some((o) => o.accepted)).toBe(true);
        expect(receiver.events.length).toBeGreaterThanOrEqual(1);
        const last = receiver.events[receiver.events.length - 1] as {
          eventId: string;
          name: string;
          data: Record<string, unknown>;
        };
        expect(last.name).toBe(c.name);
        c.expectData(last.data);
        const body = JSON.stringify(last);
        expect(new Webhook(secret).sign(last.eventId, new Date(), body)).toMatch(/^v1,/);
      } finally {
        await receiver.close();
      }
    });
  }

  it("blocks subscribe when callback host is off allowlist", async () => {
    process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST = "1";
    const receiver = await startEchoReceiver();
    const secret = generateWhsecSecretSync();
    try {
      await expect(
        runMcpEventsEffect(
          Effect.gen(function* () {
            const svc = yield* McpEventsService;
            return yield* svc.subscribe({
              principal: "tester",
              name: "notification.sent",
              arguments: {},
              delivery: { mode: "webhook", url: receiver.url, secret },
            });
          }),
          {
            store: createMemorySubscriptionStore(),
            enterprise: {
              callbackAllowlist: ["chatgpt.com", "*.oaiusercontent.com"],
              maxSubscriptionsPerPrincipal: 25,
              maxDeliveriesPerMinutePerPrincipal: 60,
              redactPii: false,
            },
          }
        )
      ).rejects.toThrow(/allowlist|ALLOWLIST/i);
    } finally {
      await receiver.close();
    }
  });
});
