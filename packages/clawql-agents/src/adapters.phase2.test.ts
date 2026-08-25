import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORMAuditTrail } from "clawql-audit";
import { AgentAdapter } from "./shared/types.js";
import { enforceToolCall, isToolInScope, PanguardDenyError } from "./shared/panguard.js";
import { makeAgentWormLayer } from "./shared/worm.js";
import { CLINE_ATR_TEMPLATES } from "./adapters/cline/atr-templates.js";
import { OPENCLAW_ATR_TEMPLATES } from "./adapters/openclaw/atr-templates.js";
import {
  appendOpenClawHook,
  gateOpenClawSkillInvoke,
  makeOpenClawAdapterLayer,
} from "./adapters/openclaw/index.js";
import { planOpenClawSkillInjection } from "./adapters/openclaw/mcp-bridge.js";
import { HERMES_ATR_TEMPLATES } from "./adapters/hermes/atr-templates.js";
import { appendHermesHook, makeHermesAdapterLayer } from "./adapters/hermes/index.js";
import { getAdapterBundle } from "./get-adapter.js";

describe("shared panguard", () => {
  it("isToolInScope respects out-of-scope denylist", () => {
    const scope = CLINE_ATR_TEMPLATES.execution_worker;
    expect(isToolInScope("memory_recall", scope)).toBe(true);
    expect(isToolInScope("sandbox_exec", scope)).toBe(false);
  });

  it("enforceToolCall denies and writes WORM", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-agents-pg-"));
    try {
      const dbPath = join(dir, "worm.db");
      const layer = makeAgentWormLayer(dbPath);
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          return yield* enforceToolCall({
            toolName: "sandbox_exec",
            atrScope: CLINE_ATR_TEMPLATES.execution_worker,
            sessionId: "sess-1",
            agentName: "cline",
          }).pipe(Effect.either);
        }).pipe(Effect.provide(layer))
      );
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(PanguardDenyError);
      }
      const verified = await Effect.runPromise(
        Effect.gen(function* () {
          const worm = yield* WORMAuditTrail;
          return yield* worm.verify();
        }).pipe(Effect.provide(layer))
      );
      expect(verified.ok).toBe(true);
      expect(verified.records).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("OpenClaw adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("starts session, gates skill, appends hook", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-oc-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makeOpenClawAdapterLayer());
    const atr = OPENCLAW_ATR_TEMPLATES.readonly_assistant;

    const session = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_oc",
          teeEnabled: false,
        });
        const s = yield* adapter.start(atr);
        yield* gateOpenClawSkillInvoke({
          skillName: "clawql_memory_recall",
          atrScope: atr,
          sessionId: s.sessionId,
          virtualKeyId: "vk_oc",
        });
        const denied = yield* gateOpenClawSkillInvoke({
          skillName: "clawql_execute",
          atrScope: atr,
          sessionId: s.sessionId,
        }).pipe(Effect.either);
        expect(denied._tag).toBe("Left");
        yield* appendOpenClawHook({
          kind: "skill_invoke",
          sessionId: s.sessionId,
          skillName: "clawql_memory_recall",
        });
        return s;
      }).pipe(Effect.provide(layer))
    );

    expect(session.agent).toBe("openclaw");
    const plan = await Effect.runPromise(
      planOpenClawSkillInjection(
        [
          { name: "memory_recall", description: "recall" },
          { name: "execute", description: "exec" },
        ],
        atr
      )
    );
    expect(plan.skills.map((s) => s.name)).toEqual(["clawql_memory_recall"]);
    expect(plan.skippedOutOfScope).toContain("execute");
  });
});

describe("Hermes adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("starts session and logs delegation hook", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-hm-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makeHermesAdapterLayer());
    const atr = HERMES_ATR_TEMPLATES.orchestrator;

    const verified = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_hm",
          teeEnabled: false,
        });
        const s = yield* adapter.start(atr);
        yield* appendHermesHook({
          kind: "delegation",
          sessionId: s.sessionId,
          subagent: "cline",
          delegationId: "del-1",
        });
        yield* adapter.stop(s);
        const worm = yield* WORMAuditTrail;
        return yield* worm.verify();
      }).pipe(Effect.provide(layer))
    );

    expect(verified.ok).toBe(true);
    expect(verified.records).toBeGreaterThanOrEqual(3);
  });
});

describe("getAdapterBundle", () => {
  it("resolves cline", async () => {
    const cline = await Effect.runPromise(getAdapterBundle("cline", "/tmp/x.db"));
    expect(cline.adapterLayer).toBeDefined();
  });
});
