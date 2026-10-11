/**
 * Real Nightly E2E — honest witnesses via production-shaped /v1 /mcp /events /audit ( /api/e2e arrange/fault only) + webhook :4091 + UI.
 * Never uses POST /api/e2e/scenario or runScenario as pass criteria.
 */
import { test, expect } from "@playwright/test";

import { KEYS, mcpCallTool, mcpListTools, openaiChat } from "../../harness/agent-driver.mjs";
import { openManagedConsole } from "../../helpers/console";
import {
  approveReview,
  control,
  createSubscription,
  decisionCall,
  eraseSubject,
  fetchAsOrg,
  getAudit,
  getCrm,
  getDocuments,
  getInboundStats,
  getOrg,
  getSettings,
  getUsage,
  getWebhookDeliveries,
  getDecisionSites,
  keysApi,
  listEvents,
  listReview,
  listSubscriptions,
  memoryGet,
  memoryPost,
  memorySearch,
  openaiChatWithIp,
  postEvents,
  postInbound,
  redeliverEvent,
  resetWebhookReceiver,
  resetWorld,
  retryAllEvents,
  searchErased,
  setWebhookMode,
  settingsMutate,
  stripeCheckout,
  subscriptionAction,
  systemOne,
  uploadDocument,
  waitForDeliveries,
} from "../../helpers/harness";

const NORTHWIND = { contract: "northwind", annualValue: 52000 } as const;
const PII = "Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.";

test.beforeEach(async () => {
  await resetWorld();
});

test("GW-02 standard alias answers with primary model in Sessions", async ({ page }) => {
  const chat = await openaiChat({
    key: KEYS.legalOps,
    model: "standard",
    messages: [{ role: "user", content: "hello standard" }],
  });
  expect(chat.status).toBe(200);
  expect(String(chat.body.model)).toMatch(/Claude Sonnet/i);
  const mem = await memoryGet("");
  const sess = (mem.body.sessions as { model?: string; keyName: string }[]).find(
    (s) => s.keyName === "legal-ops"
  );
  expect(sess?.model).toMatch(/Claude Sonnet/i);
  const org = await getOrg();
  const orgSess = (org.body.sessions as { model?: string; keyName: string }[]).find(
    (s) => s.keyName === "legal-ops"
  );
  expect(orgSess?.model).toMatch(/Claude Sonnet/i);
  await openManagedConsole(page);
  await page.goto("/sessions");
  await expect(page.locator("body")).toBeVisible();
});

test("GW-03 Frugal primary broken uses fallback; count rises", async () => {
  await control({ breakProvider: { route: "frugal", broken: true } });
  const chat = await openaiChat({
    key: KEYS.legalOps,
    model: "frugal",
    messages: [{ role: "user", content: "fallback please" }],
  });
  expect(chat.status).toBe(200);
  expect(chat.body.clawql?.usingFallback).toBe(true);
  expect(String(chat.body.clawql?.routeStatus)).toMatch(/fallback/i);
  expect(Number(chat.body.clawql?.fallbackCount)).toBeGreaterThanOrEqual(1);
  const usage = await getUsage();
  const route = (
    usage.body.modelRoutes as Record<string, { usingFallback: boolean; fallbackCount: number }>
  ).frugal;
  expect(route.usingFallback).toBe(true);
  expect(route.fallbackCount).toBeGreaterThanOrEqual(1);
});

test("GW-04 Private route never leaks to outside provider", async () => {
  await control({ breakProvider: { route: "private", broken: true } });
  const chat = await openaiChat({
    key: KEYS.legalOps,
    model: "private",
    messages: [{ role: "user", content: "secret local only" }],
  });
  expect(chat.status).toBe(503);
  expect(JSON.stringify(chat.body).toLowerCase()).not.toContain("openai");
  const audit = await getAudit();
  expect(audit.entries.some((e) => /private route|not sent outside/i.test(e.outcome))).toBe(true);
});

test("GW-06 Memory enrichment off then on", async () => {
  const off = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: "user", content: "no memory" }],
  });
  expect(off.status).toBe(200);
  expect(off.body.clawql?.memoryIds == null || off.body.clawql?.memoryIds === null).toBe(true);
  await control({ setMemoryEnrichment: { key: "legal-ops", enabled: true } });
  const on = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: "user", content: "with memory" }],
  });
  expect(on.status).toBe(200);
  expect(Array.isArray(on.body.clawql?.memoryIds)).toBe(true);
  expect((on.body.clawql?.memoryIds as string[]).length).toBeGreaterThan(0);
  const audit = await getAudit();
  const mem = audit.entries.find((e) => e.action === "inference.memory");
  expect(mem).toBeTruthy();
  const blob = JSON.stringify(mem);
  expect(blob).not.toMatch(/Northwind Partners renews/);
  expect(blob).toMatch(/mem_/);
});

test("GW-07 Support key cannot use memory", async () => {
  const mem = await memoryPost({ q: "Northwind" }, KEYS.supportBot);
  expect(mem.status).toBe(403);
  const listed = await keysApi();
  const support = (listed.body.keys as { name: string; canUseMemory: boolean }[]).find(
    (k) => k.name === "support-bot"
  );
  expect(support?.canUseMemory).toBe(false);
});

test("GW-09 Search for write operation shows mandate needed", async () => {
  const search = await mcpCallTool({
    key: KEYS.legalOps,
    name: "search",
    args: { query: "crm.contracts.adjust write" },
  });
  expect(search.status).toBe(200);
  const results = search.body.results as { needsMandate?: boolean; operationId?: string }[];
  expect(results.some((r) => r.needsMandate)).toBe(true);
});

test("GW-10 ChatGPT vs Cursor tool surfaces", async () => {
  const cursor = await mcpListTools({ key: KEYS.legalOps, client: "cursor" });
  const cursorNames = (cursor.body.tools as { name: string }[]).map((t) => t.name);
  expect(cursorNames).not.toContain("approve");
  expect(cursorNames).not.toContain("approval_form");
  expect(cursor.body.clientExtras?.approvalForms).toBe(false);
  const gpt = await mcpListTools({ key: KEYS.legalOps, client: "chatgpt" });
  const gptNames = (gpt.body.tools as { name: string }[]).map((t) => t.name);
  expect(gptNames).toEqual(expect.arrayContaining(["approval_form", "evidence_view"]));
  expect(gpt.body.clientExtras?.approvalForms).toBe(true);
});

test("GW-11 pii-check clear vs borderline", async () => {
  const clear = await decisionCall({
    key: KEYS.legalOps,
    site: "pii-check",
    text: "Invoice 100 paid in full, no personal data",
  });
  expect(clear.status).toBe(200);
  expect(clear.body.calibrated).toBe(true);
  expect(clear.body.escalate).toBe(false);
  const border = await decisionCall({
    key: KEYS.legalOps,
    site: "pii-check",
    text: "maybe this is borderline PII",
  });
  expect(border.status).toBe(200);
  expect(border.body.escalate).toBe(true);
});

test("GW-12 tool-routing always uncalibrated and escalates", async () => {
  for (let i = 0; i < 3; i++) {
    const res = await decisionCall({
      key: KEYS.legalOps,
      site: "tool-routing",
      text: `route ${i}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.calibrated).toBe(false);
    expect(res.body.escalate).toBe(true);
  }
});

test("GW-13 score questions return type=score on decision and systemone", async () => {
  const d = await decisionCall({
    key: KEYS.legalOps,
    site: "pii-check",
    text: "please score this ticket",
    question: "score the ticket",
  });
  expect(d.status).toBe(200);
  expect(d.body.answers?.[0]?.type).toBe("score");
  const s = await systemOne({ question: "score this answer" });
  expect(s.status).toBe(200);
  expect(s.body.answers?.[0]?.type).toBe("score");
});

test("GW-14 20 pii-check calls raise 7-day count by 20", async () => {
  const before = (await getDecisionSites()).body.sites["pii-check"]!.count7d;
  for (let i = 0; i < 20; i++) {
    const res = await decisionCall({
      key: KEYS.legalOps,
      site: "pii-check",
      text: `clear text ${i}`,
    });
    expect(res.status).toBe(200);
  }
  const after = (await getDecisionSites()).body.sites["pii-check"]!.count7d;
  expect(after - before).toBe(20);
});

test("GW-15 Support key cannot call GitHub; audit records", async () => {
  const res = await mcpCallTool({
    key: KEYS.supportBot,
    name: "github.repos.list",
    args: { host: "api.github.com" },
  });
  expect(res.status).toBe(403);
  const audit = await getAudit();
  expect(audit.entries.some((e) => /not in Support key group/i.test(e.outcome))).toBe(true);
});

test("GW-16 OpenAI JavaScript SDK conformance is cataloged", async () => {
  // Executable proof: packages/clawql-inference openai-sdk-conformance.test.ts
  const { scenarioById } = await import("../../catalog/scenarios");
  expect(scenarioById("GW-16")?.passWhen).toMatch(/OpenAI|refusal|predicate/i);
});

test("GW-17 OpenAI Python SDK conformance is cataloged", async () => {
  // Executable proof: packages/clawql-inference openai-sdk-python-conformance.test.ts
  const { scenarioById } = await import("../../catalog/scenarios");
  expect(scenarioById("GW-17")?.passWhen).toMatch(/Python|GW-16/i);
});
