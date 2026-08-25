---
title: "clawql-agents — Package Specification"
status: "target architecture · August 2026"
version: "0.1"
package: "packages/clawql-agents/"
---

# clawql-agents — Package Specification

**August 2026 · v0.1**

> **Status (repo, 2026-08-25):** Phases 1–4 adapters shipped. Follow-on: personal-agent install hooks, OpenClaw live MCP plans, `getOutboundCredential`, Helm overlays, Agents OpenBench **dry** runner (`integrations/agents-bench/`). Live OpenBench A/B remains gated (Harvey / ExtractBench). Durable WORM: `packages/clawql-audit`.
>
> **Related:** [Agents index](README.md) · [Personal Hermes/Cline setup](../homelab/personal-agent-hermes-cline.md) · [Agents OpenBench spec](../benchmarks/agents-openbench-spec-v0.1.md) · [OpenBench plan](../benchmarks/agents-openbench-plan.md) · [Modularization status](../design/modularization-implementation-status.md) · [clawql-tee](../streams/clawql-tee.md) (draft) · [MCP tools](../mcp/mcp-tools.md)

### Repo mapping

| Name in this document                                 | In this repository today                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/clawql-agents/`                             | **Phases 1–4 + follow-on** — all seven adapters + ATR templates + shared Panguard; personal install, OpenClaw live MCP plans, outbound credentials, Helm overlays, dry OpenBench runner. Live A/B still gated. |
| `bench/` in this package                              | Dry runner at `src/bench/dry-runner.ts`; live harness entry is **`integrations/agents-bench/`** (gated)                                                                                                       |
| npm `@clawql/agents`, `@clawql/core`, `@clawql/audit` | Packages are **unscoped** `clawql-*`. MCP audit ring lives in **`clawql-core`**. Durable WORM ships in **`clawql-audit@8.0.0`**: [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md). |
| Adapter `initialize` / `start` as `Promise`           | Production domain APIs **must** be Effect (`Context.Tag` + `Layer`). Sketches below are contracts, not the implementation shape.                                                                             |
| OpenClaw MCP wiring                                   | Adapter live MCP plans + `scripts/dev/openclaw-register-clawql.sh`; operator docs in [`docs/openclaw/`](../openclaw/using-openclaw-with-clawql.md)                                                           |
| Hermes                                                | Package ships `python/hermes/worm_agent.py` + adapter; inference coordination stub remains in `clawql-inference`                                                                                             |
| Cline WORM SDK hooks                                  | `installPersonalAgentHooks` materializes hooks; full ACP wiring still operator-side                                                                                                                        |
| clawql-tee attestation                                | **Draft** spec ([`docs/streams/clawql-tee.md`](../streams/clawql-tee.md)); not a runtime flag you can flip                                                                                                   |
| RockYourLobster tiers / prices                        | GTM target in this spec; tier capability map exported from package (no payment gating)                                                                                                                        |

### Catalog vs OpenBench

This spec catalogs **seven** agents (adds **Cline**). Agents OpenBench v0.1 is **six** agents × S/M/P = **90** tasks (OpenClaw, Hermes, Pi, Goose, DeepSeek Harness, OpenHands). Adding Cline is a **spec revision** (+15 tasks, or a Cline Family S MVP). Do not silently expand the ledger.

### Still gated

1. Live Agents OpenBench A/B (Harvey LAB + ExtractBench publish — see [plan](../benchmarks/agents-openbench-plan.md)).
2. Keep shippable MCP tool names (`memory_*`, `search`, `execute`, `audit`, `cache`, `data_query` / `clawql_sql`, optional `web_search`). Do not invent `clawql_think` until a real tool exists.

---

## 1. Purpose

`clawql-agents` is the ClawQL monorepo package that provides hardened adapter integrations for the seven open-source agents supported in RockYourLobster. Each adapter connects an agent to ClawQL's full infrastructure stack — Panguard enforcement, WORM audit trail, vault memory, PAL routing, and clawql-tee attestation — without requiring changes to the agent's core code.

The package provides:

- Agent adapters (one per agent) that wire ClawQL MCP tools into the agent's tool catalog and intercept the agent's action stream for WORM logging
- ATR scope templates (one per agent family) defining sensible default scope declarations for common deployment scenarios
- Helm chart values overlays for deploying each agent into a ClawQL-managed Kubernetes cluster
- Benchmark harness integration for ClawQL Agents OpenBench

---

## 2. The Seven Agents

### 2.1 Agent Catalog

| Agent            | License                | Stars       | Primary Use Case                                            | ClawQL Gap                                                                                       |
| ---------------- | ---------------------- | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| OpenClaw         | MIT                    | 369k+       | General agentic gateway, multi-channel messaging            | 150+ CVEs, no auth by default, no scope control, context dissolves between sessions              |
| Hermes           | MIT                    | 135k+       | Self-improving personal assistant, communication automation | No audit trail on outbound comms, no cross-session memory of prior decisions                     |
| Pi               | Proprietary (open API) | N/A         | Personal AI assistant, conversational continuity            | No data scope enforcement, long-term preferences not persisted                                   |
| Goose            | Apache 2.0             | —           | Coding agent (Block), file system and shell access          | No scoped write permissions, no audit trail on autonomous code changes                           |
| DeepSeek Harness | MIT                    | —           | Plugin-based agent harness (Cordis architecture)            | Plugin boundaries not enforced at runtime, session log local and non-tamper-evident              |
| OpenHands        | MIT                    | 81k+        | Autonomous software engineering, codebase modification      | No cost ceiling enforcement, no tamper-evident audit trail, no cross-session engineering context |
| Cline            | Apache 2.0             | 8M installs | VS Code + CLI coding agent, MCP-native                      | No enterprise audit trail, no ATR scope enforcement on tool calls                                |

### 2.2 Why These Seven

Each agent was selected against three criteria:

**Open license.** The adapter must be able to wrap the agent without license friction. MIT and Apache 2.0 agents can be wrapped in ClawQL's infrastructure without restriction. Pi is the exception — its API is open even if the weights are not, making it wrappable at the API layer.

**Genuine enterprise adoption or trajectory.** Each agent has either proven enterprise adoption (OpenHands: AMD, Apple, Google, Netflix; Cline: 8M installs) or a clear enterprise deployment story (Hermes: self-improving institutional knowledge; Goose: Block engineering pedigree).

**A specific security or compliance gap that ClawQL fills.** The gap must be demonstrable on the Agents OpenBench benchmark — a task where the baseline agent fails and the ClawQL-augmented agent succeeds because of Panguard enforcement, vault memory, or WORM audit trail, not because of model capability.

**Devin excluded:** Proprietary, cloud-only, no self-host option, no auditable binary. Incompatible with the regulated enterprise requirements that make RockYourLobster valuable. Used as a competitive foil in sales conversations, not as a catalog agent.

---

## 3. Package Structure

Target layout (not in the tree):

```
packages/clawql-agents/
  src/
    adapters/
      openclaw/
        index.ts              — OpenClaw adapter entry point
        atr-templates.ts      — Default ATR scope templates for OpenClaw
        worm-hooks.ts         — WORM instrumentation for OpenClaw action stream
        mcp-bridge.ts         — ClawQL MCP tool injection into OpenClaw skill catalog
      hermes/
        index.ts
        atr-templates.ts
        worm-hooks.ts         — Python subprocess hooks for Hermes AIAgent subclass
        mcp-bridge.ts
      pi/
        index.ts
        atr-templates.ts
        worm-hooks.ts
        mcp-bridge.ts         — Pi API adapter with ClawQL tool injection
      goose/
        index.ts
        atr-templates.ts
        worm-hooks.ts
        mcp-bridge.ts
      deepseek/
        index.ts
        atr-templates.ts
        worm-hooks.ts         — Cordis plugin wrapper for ATR and WORM
        mcp-bridge.ts
      openhands/
        index.ts
        atr-templates.ts
        worm-hooks.ts         — OpenHands event stream interceptor
        mcp-bridge.ts
        budget-enforcer.ts    — ClawQL virtual key budget enforcement
      cline/
        index.ts
        atr-templates.ts
        worm-hooks.ts         — Cline SDK hook registration
        mcp-bridge.ts         — Native MCP server registration (Cline speaks MCP)
    shared/
      worm.ts                 — Shared WORM entry builder
      panguard.ts             — ATR scope enforcement utilities
      session.ts              — Virtual key and cell ID management
      types.ts                — Shared TypeScript types
  helm/
    openclaw/
      values-clawql.yaml      — Helm values overlay for ClawQL-augmented OpenClaw
    hermes/
      values-clawql.yaml
    pi/
      values-clawql.yaml
    goose/
      values-clawql.yaml
    deepseek/
      values-clawql.yaml
    openhands/
      values-clawql.yaml
    cline/
      values-clawql.yaml
  bench/
    openclaw/                 — Prefer integrations/agents-bench/ per OpenBench plan
    hermes/
    pi/
    goose/
    deepseek/
    openhands/
    cline/
  docs/
    openclaw.md
    hermes.md
    pi.md
    goose.md
    deepseek.md
    openhands.md
    cline.md
  index.ts                    — Package entry point
  package.json
  tsconfig.json
```

**Harness location:** keep a **single** runner. Until OpenBench gates clear, that is `integrations/agents-bench/` (planned). `packages/clawql-agents/bench/` should re-export or thin-wrap it, not fork task definitions.

---

## 4. Agent Adapters

### 4.1 Adapter Interface

Every agent adapter implements the same interface. The specifics of how WORM hooks are applied and how MCP tools are injected differ per agent, but the external interface is uniform.

**Implementation note:** the `Promise` methods below are the **contract**. The shipped package must expose an Effect `Context.Tag` (for example `AgentAdapter`) whose methods return `Effect.Effect<…>`; any MCP/HTTP host stays a one-line `runPromise` façade.

```typescript
// packages/clawql-agents/src/shared/types.ts

export interface AgentAdapter {
  name: AgentName;
  version: string;

  // Initialize the adapter with ClawQL configuration
  initialize(config: ClawQLAgentConfig): Promise<void>;

  // Start the agent with ATR scope enforcement
  start(atrScope: ATRScope): Promise<AgentSession>;

  // Stop the agent and flush WORM trail
  stop(session: AgentSession): Promise<void>;

  // Health check
  health(): Promise<{ status: "healthy" | "degraded" | "down"; details: string }>;
}

export type AgentName = "openclaw" | "hermes" | "pi" | "goose" | "deepseek" | "openhands" | "cline";

export interface ClawQLAgentConfig {
  mcpEndpoint: string; // ClawQL MCP server URL
  wormEndpoint: string; // WORM audit trail endpoint
  inferenceEndpoint: string; // clawql-inference gateway URL
  virtualKeyId: string; // Pre-provisioned virtual key
  teeEnabled: boolean; // Whether clawql-tee attestation is required
}

export interface ATRScope {
  toolsInScope: string[];
  toolsOutOfScope: string[];
  budget: {
    maxTokens: number;
    maxUsd: number;
    maxTurns: number;
  };
  sessionTtl: number; // seconds
}
```

### 4.2 OpenClaw Adapter

OpenClaw is TypeScript-native and uses a skill-based tool catalog. The ClawQL adapter injects ClawQL MCP tools as OpenClaw skills and registers WORM hooks on the Gateway's command queue.

```typescript
// packages/clawql-agents/src/adapters/openclaw/mcp-bridge.ts

export async function injectClawQLSkills(
  openClawInstance: OpenClaw,
  mcpEndpoint: string,
  atrScope: ATRScope
): Promise<void> {
  // Discover available MCP tools from ClawQL
  const tools = await discoverMCPTools(mcpEndpoint);

  // Filter to only tools declared in ATR scope
  const allowedTools = tools.filter((t) => atrScope.toolsInScope.includes(t.name));

  // Inject each as an OpenClaw skill
  for (const tool of allowedTools) {
    await openClawInstance.skills.register({
      name: `clawql_${tool.name}`,
      description: tool.description,
      handler: async (args) => {
        // All tool calls route through Panguard first
        return callWithPanguard(tool.name, args, atrScope);
      },
    });
  }

  // Register Panguard intercept on all skill invocations
  openClawInstance.gateway.on("skill:invoke", async (event) => {
    if (!atrScope.toolsInScope.includes(event.skillName)) {
      await worm.append({
        type: "PANGUARD_DENY",
        toolName: event.skillName,
        reason: "out_of_scope",
        virtualKeyId: event.virtualKeyId,
        cellId: event.cellId,
        timestamp: new Date().toISOString(),
      });
      throw new PanguardDenyError(`${event.skillName} is not in scope`);
    }
  });
}
```

**WORM hooks for OpenClaw:**

OpenClaw's Gateway emits events for every command. The WORM hook subscribes to these events and writes an entry for each one — tool call attempts, Panguard denies, session lifecycle events, and any cron job triggers.

Skill names in OpenClaw should match **MCP tool names** (`memory_recall`, not a parallel `clawql_memory_recall` catalog) unless a prefix is required to avoid collisions. Double-prefixing makes ATR templates and OpenBench stubs diverge.

### 4.3 Hermes Adapter

Hermes is Python-based. The ClawQL adapter is implemented as a Python subclass of Hermes's `AIAgent` that overrides the key action dispatch points to write WORM entries.

The subclass approach means no Hermes source code modifications are needed — the adapter is a standalone Python file that Hermes loads via its `runtime_class` configuration key.

See the [personal agent setup](../hermes/personal-agent-setup.md) document for the full `WORMInstrumentedAgent` subclass implementation.

**MCP bridge for Hermes:**

Hermes exposes an OpenAI-compatible endpoint that Cline and other tools can point at. The ClawQL adapter intercepts calls at this endpoint, applies Panguard enforcement, and routes to the actual model via clawql-inference.

Personal-agent topology is the inverse of a naive reading: **Hermes → clawql-inference `:8091` → Ornith**, with Cline as a **subagent**, not Hermes pretending to be an OpenAI server for Cline. Keep those two wiring diagrams distinct when implementing.

### 4.4 Pi Adapter

Pi is accessed via its public API. The adapter wraps the Pi API client with ATR scope enforcement and WORM logging on every API call. Pi's stateless API means cross-session memory is provided entirely by ClawQL's vault — the adapter calls `memory_recall` at the start of each session and `memory_ingest` at the end.

### 4.5 Goose Adapter

Goose is Apache 2.0 with a clear extension point for tool registration. The adapter registers ClawQL MCP tools into Goose's tool catalog and wraps Goose's file system and shell execution tools with Panguard enforcement.

The file system wrapper is the most important piece — it intercepts every `file_write` call and checks whether the target path is within the declared ATR scope before allowing execution.

`ATRScope` in §4.1 has `toolsInScope` / `toolsOutOfScope`, not `allowedPaths`. Path scope is an **extension field** required for Goose/OpenHands/Cline; add it to the shared type before implementing the wrapper.

```typescript
// packages/clawql-agents/src/adapters/goose/worm-hooks.ts

export function wrapFileSystemTools(goose: Goose, atrScope: ATRScope): void {
  const originalWrite = goose.tools.file_write;

  goose.tools.file_write = async (path: string, content: string) => {
    // Check path against ATR scope
    const inScope = atrScope.allowedPaths.some((p) => path.startsWith(p));

    await worm.append({
      type: inScope ? "GOOSE_FILE_WRITE_ATTEMPT" : "PANGUARD_DENY",
      path,
      inScope,
      reason: inScope ? undefined : "path_out_of_scope",
      timestamp: new Date().toISOString(),
    });

    if (!inScope) {
      throw new PanguardDenyError(`Write to ${path} is outside declared scope`);
    }

    return originalWrite(path, content);
  };
}
```

Prefix matching is not a sandbox. Symlinks, `..`, and case-folding must be resolved before `startsWith`.

### 4.6 DeepSeek Harness Adapter

DeepSeek Harness uses the Cordis plugin architecture. The ClawQL adapter is implemented as a Cordis plugin that registers alongside the other plugins and intercepts the service bus events that represent tool calls and agent actions.

The dynamic plugin loading intercept is unique to DeepSeek Harness — the adapter monitors for `plugin:load` events on the Cordis kernel and blocks any plugin loads not declared in the ATR scope at session creation time.

```typescript
// packages/clawql-agents/src/adapters/deepseek/worm-hooks.ts

export function registerCordisWORMPlugin(cordis: CordisKernel, atrScope: ATRScope): void {
  // Intercept all plugin load events
  cordis.on("plugin:load", async (event) => {
    const pluginName = event.plugin.name;

    if (!atrScope.allowedPlugins?.includes(pluginName)) {
      await worm.append({
        type: "PANGUARD_DENY",
        action: "plugin_load_dynamic",
        pluginName,
        reason: "plugin_not_in_scope",
        timestamp: new Date().toISOString(),
      });
      event.preventDefault();
    }
  });

  // Intercept all tool call events
  cordis.on("tool:call", async (event) => {
    await worm.append({
      type: "DEEPSEEK_TOOL_CALL_ATTEMPT",
      toolName: event.tool,
      args: sanitizeArgs(event.args),
      timestamp: new Date().toISOString(),
    });
  });
}
```

### 4.7 OpenHands Adapter

OpenHands uses an event stream architecture — every agent action is an event on a central event bus. The ClawQL adapter subscribes to this event stream and writes WORM entries for every event while intercepting actions that violate ATR scope.

The budget enforcer is a key OpenHands-specific addition. OpenHands defaults to MAX_ITERATIONS ~100 with no hard cost cutoff. The adapter enforces the virtual key budget at the event stream level — when the budget is exhausted, a `BUDGET_EXHAUSTED` event is emitted and the session terminates gracefully with a partial deliverable rather than running indefinitely.

Prefer enforcing budget in **clawql-inference virtual keys** (already in `packages/clawql-inference`) and treating this class as a **second chokepoint** for non-inference OpenHands work (shell/files), not a parallel accounting system.

```typescript
// packages/clawql-agents/src/adapters/openhands/budget-enforcer.ts

export class OpenHandsBudgetEnforcer {
  private tokenCount = 0;
  private costUsd = 0;

  constructor(
    private readonly budget: ATRScope["budget"],
    private readonly worm: WORMAuditTrail,
    private readonly session: AgentSession
  ) {}

  async checkBudget(event: OpenHandsEvent): Promise<void> {
    if (event.type === "agent:inference") {
      this.tokenCount += event.inputTokens + event.outputTokens;
      this.costUsd += event.costUsd;

      if (this.tokenCount > this.budget.maxTokens || this.costUsd > this.budget.maxUsd) {
        await this.worm.append({
          type: "BUDGET_EXHAUSTED",
          tokenCount: this.tokenCount,
          costUsd: this.costUsd,
          budget: this.budget,
          sessionId: this.session.id,
          timestamp: new Date().toISOString(),
        });

        // Graceful termination — request partial deliverable before stopping
        this.session.emit("budget:exhausted", {
          reason: "budget_exceeded",
          partialWork: true,
        });
      }
    }
  }
}
```

### 4.8 Cline Adapter

Cline is the most naturally compatible agent because it natively speaks MCP. The adapter registers ClawQL's MCP server directly into Cline's MCP server list. No bridge layer is needed for tool calls — Cline calls ClawQL MCP tools natively.

The WORM hooks use Cline's SDK hook system, which exposes pre/post hooks for file operations and terminal execution. The full hook implementation is in the [personal agent setup](../hermes/personal-agent-setup.md) document.

**The Cline integration is the reference implementation** because it represents the intended architecture: an agent that natively calls ClawQL MCP tools, with WORM hooks added at the SDK level for non-MCP actions. Future agents should integrate this way where possible.

Native MCP covers ClawQL tools only. File/terminal still bypass Panguard unless the hooks in that document actually run and/or Cline is configured so host tools are denied.

---

## 5. ATR Scope Templates

Each agent ships with default ATR scope templates for common deployment scenarios. Operators can customize these or declare their own.

Family S OpenBench stubs (`email_send`, `calendar_write`, …) are **harness tools**, not current ClawQL MCP tools. Templates below are **target catalogs**. A shippable v0 template uses only tools that `tools/list` actually returns.

```typescript
// packages/clawql-agents/src/adapters/openclaw/atr-templates.ts

export const OPENCLAW_ATR_TEMPLATES = {
  // Read-only assistant — can recall and search, cannot send or modify
  readonly_assistant: {
    toolsInScope: ["memory_recall", "web_search", "calendar_read", "email_read", "contact_search"],
    toolsOutOfScope: [
      "email_send",
      "calendar_write",
      "contact_modify",
      "file_write",
      "file_delete",
    ],
    budget: {
      maxTokens: 500_000,
      maxUsd: 5.0,
      maxTurns: 50,
    },
    sessionTtl: 3600,
  },

  // Drafting assistant — can draft and present for approval, cannot send
  drafting_assistant: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "web_search",
      "calendar_read",
      "email_read",
      "email_draft", // draft only, not send
    ],
    toolsOutOfScope: ["email_send", "calendar_write", "contact_modify", "file_delete"],
    budget: {
      maxTokens: 300_000,
      maxUsd: 3.0,
      maxTurns: 30,
    },
    sessionTtl: 1800,
  },

  // Full automation — can send and modify, all actions WORM-audited
  full_automation: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "web_search",
      "calendar_read",
      "calendar_write",
      "email_read",
      "email_send",
      "contact_search",
      "contact_modify",
    ],
    toolsOutOfScope: [
      "file_delete", // always require human approval for deletion
      "contact_delete",
    ],
    budget: {
      maxTokens: 1_000_000,
      maxUsd: 10.0,
      maxTurns: 100,
    },
    sessionTtl: 7200,
    requireWORMAudit: true, // mandatory for full automation
  },
};
```

Similar template sets exist for each agent, reflecting their specific tool catalogs and common deployment scenarios.

---

## 6. RockYourLobster Tiers

The `clawql-agents` package supports all three RockYourLobster deployment tiers:

```typescript
export type RockYourLobsterTier =
  | "self_serve_helm" // $299/month — Helm chart, default ATR templates
  | "managed" // $999/month — ClawQL-managed infrastructure
  | "enterprise_tee"; // from $3,500/month — clawql-tee, hardware attestation

export const TIER_CAPABILITIES: Record<RockYourLobsterTier, TierCapabilities> = {
  self_serve_helm: {
    agents: ["openclaw", "hermes", "pi", "goose", "deepseek", "openhands", "cline"],
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: false,
    qrAirGapExport: false,
    hardwareAttestation: false,
    sla: false,
    dpa: false,
    baa: false,
  },
  managed: {
    agents: ["openclaw", "hermes", "pi", "goose", "deepseek", "openhands", "cline"],
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: false,
    qrAirGapExport: false,
    hardwareAttestation: false,
    sla: true,
    dpa: true,
    baa: false,
  },
  enterprise_tee: {
    agents: ["openclaw", "hermes", "pi", "goose", "deepseek", "openhands", "cline"],
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: true,
    qrAirGapExport: true,
    hardwareAttestation: true, // AMD SEV-SNP, Intel TDX, AWS Nitro
    sla: true,
    dpa: true,
    baa: true,
  },
};
```

Prices and legal artifacts (SLA/DPA/BAA) are **GTM**, not package behavior. Do not gate adapter code on a tier enum until payments/entitlements actually encode it.

---

## 7. Benchmark Integration

The `bench/` directory contains the ClawQL Agents OpenBench harness for each agent. See the [Agents OpenBench specification](../benchmarks/agents-openbench-spec-v0.1.md) for the full task definitions.

The benchmark runner integrates with the adapter layer:

```typescript
// packages/clawql-agents/bench/runner.ts

export async function runAgentBenchmark(
  agentName: AgentName,
  family: "S" | "M" | "P",
  tasks: BenchmarkTask[],
  config: ClawQLAgentConfig
): Promise<BenchmarkResult> {
  const adapter = getAdapter(agentName);
  await adapter.initialize(config);

  const results: TaskResult[] = [];

  for (const task of tasks) {
    // Baseline arm — no ClawQL
    const baselineResult = await runWithoutClawQL(adapter, task);

    // ClawQL arm — full stack
    const clawqlResult = await runWithClawQL(adapter, task, config);

    results.push({
      taskId: task.id,
      baseline: baselineResult,
      clawql: clawqlResult,
      delta: {
        cprLift: clawqlResult.cpr - baselineResult.cpr,
        tokenReduction: 1 - clawqlResult.tokens / baselineResult.tokens,
        wormComplete: clawqlResult.wormComplete,
      },
    });
  }

  return buildScorecard(agentName, family, results);
}
```

Family S uses **three** arms (standard / abliterated / clawql-abliterated), not two. This runner sketch is Family M/P shaped. Do not implement it until the OpenBench plan's stub-tool catalog exists.

---

## 8. Implementation Sequence

### Phase 1 — Cline (implement first)

Cline is the reference implementation because it natively speaks MCP. The adapter is the simplest to build — register ClawQL's MCP server, add SDK hooks for WORM, done. Cline is also the agent you're using for personal development via the Hermes/Ornith + Cline/Nemotron personal assistant setup, which means the adapter gets exercised immediately on real workloads rather than waiting for a customer deployment.

### Phase 2 — OpenClaw and Hermes

OpenClaw has the largest user base and the most documented failure modes. Hermes is the orchestration layer in the personal agent setup. Both should be implemented as a pair since the Hermes adapter (Python AIAgent subclass) is already partially specified in the personal agent setup document.

### Phase 3 — OpenHands and Goose

These have the clearest enterprise sales story — autonomous code modification agents in regulated environments. Priority after the communication and personal assistant agents are stable.

### Phase 4 — Pi and DeepSeek Harness

Pi requires API-layer adaptation (no open weights). DeepSeek Harness requires Cordis plugin knowledge that will be clearer after working with the other agents. Both are lower priority for the initial release.

### Phase 5 — Agents OpenBench

Benchmark harness for all seven agents after the adapters are stable. The benchmark is a validation asset for the sales motion, not a prerequisite for the adapters.

**Conflict to resolve before Phase 5:** OpenBench plan gates harness coding on Harvey + ExtractBench publish; this spec says adapters first, bench last. Those are compatible if Phase 1–4 stay **adapter-only**. They conflict if someone scaffolds `bench/` early. Default: **wait on the harness**; Cline Phase 1 is adapter + personal-agent hooks only.

---

## 9. Package Dependencies

npm names in this monorepo are unscoped. Target `package.json`:

```json
{
  "name": "clawql-agents",
  "version": "0.1.0",
  "dependencies": {
    "clawql-core": "workspace:*",
    "clawql-memory": "workspace:*",
    "clawql-inference": "workspace:*",
    "effect": "^3.21.4"
  },
  "peerDependencies": {
    "openclaw": ">=2026.4.0",
    "hermes-agent": ">=0.14.0",
    "@deepseek-ai/dsh": ">=0.1.0",
    "@cline/sdk": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "openclaw": { "optional": true },
    "hermes-agent": { "optional": true },
    "@deepseek-ai/dsh": { "optional": true },
    "@cline/sdk": { "optional": true }
  }
}
```

`packages/clawql-audit/` ships at **0.1.0** (see [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md)). Agents import `clawql-audit` for durable WORM — not a parallel WORM client. MCP `audit` remains the ephemeral ring.

All agent dependencies are optional peer dependencies. Installing `clawql-agents` without any agent framework installed is valid — you only pull in the agent framework you actually use.

---

## 10. What This Package Is Not

This package does not replace the agents. It wraps them. A user who installs the ClawQL OpenClaw adapter still runs OpenClaw. ClawQL sits between OpenClaw and the tools it calls — enforcing scope, logging actions, providing memory, and routing inference. The agent's own capabilities, skill ecosystem, and user interface are unchanged.

This package does not modify agent weights or fine-tune agent models. The adapters operate at the tool call and session management layer. Model capability is unchanged. Behavioral differences between the baseline and ClawQL arms of the Agents OpenBench are attributable entirely to infrastructure — Panguard enforcement, vault memory, and PAL routing — not to model differences.

---

## 11. First code when authorized

1. Types-only `ATRScope` (tools + **paths** + **plugins** + budget) in a future `clawql-agents` package — or in `clawql-core` if shared with Panguard.
2. **`clawql-audit` first** ([spec](../audit/clawql-audit-spec-v0.1.md)) — adapters must not invent a second WORM client.
3. Cline: MCP server registration + WORM hooks against **verified** `@cline/sdk` surfaces.
4. Effect `AgentAdapter` Tag; no seven empty adapter folders.
5. OpenBench stub tools stay in `integrations/agents-bench/` when that gate opens.

---

_clawql-agents Package Specification · v0.1 · August 2026_
_Location: packages/clawql-agents/ (target) · spec: docs/agents/clawql-agents-spec-v0.1.md_
_Contact: daniel@clawql.com_
