/**
 * Agent Substrate + isolation decision tests (ADR 0011).
 */

import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callAgentSubstrateSandbox,
  createMockAgentSubstrateLayer,
  AgentSubstrateService,
  AgentSubstrateWormSink,
  InMemoryAgentSubstrateWormSinkLive,
  readAgentSubstrateConfig,
} from "./index.js";
import {
  classifyIsolationWorkload,
  ISOLATION_DECISION_EXAMPLES,
  IsolationDecisionLive,
  IsolationDecisionService,
} from "../isolation-decision.js";

describe("classifyIsolationWorkload (ADR 0011 §3.2)", () => {
  it("routes untrusted code to Agent Substrate sandbox", () => {
    const d = classifyIsolationWorkload({
      workloadId: "sandbox_exec",
      behaviorNotFullyKnownInAdvance: true,
    });
    expect(d.host).toBe("clawql-sandbox-agent-substrate");
    expect(d.workloadClass).toBe("untrusted_arbitrary_code");
  });

  it("routes fixed-shape orchestration to celld V8 isolate", () => {
    const d = classifyIsolationWorkload({
      workloadId: "streams-cell",
      behaviorNotFullyKnownInAdvance: false,
    });
    expect(d.host).toBe("celld-v8-isolate");
    expect(d.workloadClass).toBe("fixed_shape_orchestration");
  });

  it("examples match the permanent rule", () => {
    expect(ISOLATION_DECISION_EXAMPLES.sandboxExec.host).toBe(
      "clawql-sandbox-agent-substrate"
    );
    expect(ISOLATION_DECISION_EXAMPLES.celldCell.host).toBe("celld-v8-isolate");
  });

  it("IsolationDecisionService Effect layer works", async () => {
    const d = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* IsolationDecisionService;
        return yield* svc.classify({
          workloadId: "x",
          behaviorNotFullyKnownInAdvance: false,
        });
      }).pipe(Effect.provide(IsolationDecisionLive))
    );
    expect(d.host).toBe("celld-v8-isolate");
  });
});

describe("Agent Substrate backend", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED",
      "CLAWQL_SANDBOX_AGENT_SUBSTRATE_MODE",
      "CLAWQL_SANDBOX_AGENT_SUBSTRATE_RUNTIME",
      "CLAWQL_SANDBOX_AGENT_SUBSTRATE_URL",
      "CLAWQL_SANDBOX_AGENT_SUBSTRATE_API_TOKEN",
    ]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED = "1";
    process.env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_MODE = "mock";
    process.env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_RUNTIME = "gvisor";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("reads config for mock gVisor", () => {
    const cfg = readAgentSubstrateConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.mode).toBe("mock");
    expect(cfg.runtime).toBe("gvisor");
  });

  it("executes via mock and records WORM create + exec", async () => {
    const layer = Layer.merge(
      createMockAgentSubstrateLayer(readAgentSubstrateConfig()),
      InMemoryAgentSubstrateWormSinkLive
    );
    const { result, events } = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* AgentSubstrateService;
        const result = yield* svc.exec({
          code: "print(1)",
          language: "python",
          sessionId: "sess-adr0011",
          persistenceMode: "session",
        });
        const worm = yield* AgentSubstrateWormSink;
        const events = yield* worm.list();
        return { result, events };
      }).pipe(Effect.provide(layer))
    );

    expect(result.success).toBe(true);
    expect(result.runtime).toBe("gvisor");
    expect(result.stdout).toContain("agent-substrate:gvisor:mock");
    expect(events.map((e) => e.type)).toEqual([
      "AGENT_SUBSTRATE_SESSION_CREATED",
      "AGENT_SUBSTRATE_EXEC_COMPLETED",
    ]);
  });

  it("suspend then resume emits WORM and sets resumedFromSuspend on exec", async () => {
    const layer = Layer.merge(
      createMockAgentSubstrateLayer(readAgentSubstrateConfig()),
      InMemoryAgentSubstrateWormSinkLive
    );
    // resolveSandboxId(session, "sess-suspend") → "session-sess-suspend"
    const sandboxId = "session-sess-suspend";
    const { result, types } = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* AgentSubstrateService;
        yield* svc.ensureSession(sandboxId);
        yield* svc.suspend(sandboxId);
        const result = yield* svc.exec({
          code: "x",
          language: "shell",
          sessionId: "sess-suspend",
          persistenceMode: "session",
        });
        const worm = yield* AgentSubstrateWormSink;
        const events = yield* worm.list();
        return { result, types: events.map((e) => e.type) };
      }).pipe(Effect.provide(layer))
    );

    expect(result.sessionId).toBe(sandboxId);
    expect(result.resumedFromSuspend).toBe(true);
    expect(types).toContain("AGENT_SUBSTRATE_SESSION_SUSPENDED");
    expect(types).toContain("AGENT_SUBSTRATE_SESSION_RESUMED");
  });

  it("callAgentSubstrateSandbox Promise façade tags backend", async () => {
    const r = await callAgentSubstrateSandbox({
      code: "1",
      language: "javascript",
    });
    expect(r.backend).toBe("agent-substrate");
    expect(r.success).toBe(true);
  });
});
