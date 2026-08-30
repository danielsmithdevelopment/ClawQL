---
title: "clawql-core Plugin Architecture — Providers, Tools, Hooks, Skills"
status: "August 2026"
version: "0.1"
package: "packages/clawql-core/"
---

# clawql-core Plugin Architecture

## Providers, Tools, Hooks, Skills — Specification v0.1

**August 2026** · **Release target:** ClawQL **8.0.0**

**Action items:** [clawql-8.0-plugin-architecture-action-items.md](./clawql-8.0-plugin-architecture-action-items.md) · **Migration:** [migrate-to-8.0.md](../getting-started/migrate-to-8.0.md)

---

## 1. Purpose

This document specifies how `clawql-core` composes four distinct kinds of pluggable content — **tools**, **hooks**, **skills**, and **vault-seed knowledge** — into a single discoverable, governable surface reachable through the existing `search`/`execute` primitives (and Skills-over-MCP). It also specifies the security invariants that hold regardless of which plugins are installed, and cannot be disabled, weakened, or opted out of by any plugin, including Panguard itself.

This is a `clawql-core` specification, not a `clawql-harness` or `clawql-agents` one. The distinction matters and is easy to blur:

- **`clawql-harness`** wraps execution _loops_ a model runs inside of (Ouroboros, OpenCode2). It has nothing to do with what's described here.
- **`clawql-agents`** wraps finished agent _products_ (Hermes, Cline). Also unrelated to this spec.
- **`clawql-core`** is where "any API becomes MCP" lives — the provider/tool/hook/skill architecture described here is a direct extension of that responsibility, not a new layer.

---

## 2. The Four Content Kinds

Every unit of pluggable content in `clawql-core` is one of these four kinds. A single plugin may declare any combination.

| Kind           | What it is                                               | Who consumes it                  | Executable?                             |
| -------------- | -------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| **Tool**       | A callable operation registered with `search`/`execute`  | An agent, by calling it          | Yes                                     |
| **Hook**       | Provider-declared logic at a fixed lifecycle point       | `clawql-core`'s firing mechanism | Yes (never called directly by an agent) |
| **Skill**      | Procedural knowledge — instructions, not code            | An agent, by reading it          | No — informs, doesn't execute           |
| **Vault-seed** | System self-knowledge ingested into the vault at install | An agent, via `memory_recall`    | No — informational only                 |

None of these four kinds requires any of the others to be present. A provider can ship tools with no skills. A skill can exist with no owning provider at all (§7). A hook can exist with no tools attached to the plugin that registers it (Panguard is exactly this case — see §5).

---

## 3. Plugins vs. Providers vs. Provider Plugins

These three terms are used precisely and distinctly throughout this document.

**Plugin** — the general term for any installable unit of content in `clawql-core`. Every provider plugin is a plugin. Not every plugin is a provider plugin (see §7, standalone skill plugins).

**Provider** — a specific external system or capability domain that `clawql-core` has adapted into MCP: GitHub, Linear, the internal documents/IDP stack, WebMCP-discovered sources, Panguard itself. A provider is a _domain_, not a code artifact.

**Provider Plugin** — the installable code artifact that represents a provider inside `clawql-core`. A provider plugin conventionally bundles tools, skills, vault-seed, and hooks for its domain, though (per §2) it need not include all four. Panguard is a provider plugin that ships hooks and effectively no tools.

```
plugins/                          — the general category
  providers/                      — provider plugins: tools+skills+
    github/                       —   vault-seed+hooks bundled per domain
    documents/
    panguard/                     — a provider plugin with hooks only
  skills/                         — standalone skill plugins (§7):
    handoff/                      —   no owning provider, generic utility
    session-summarizer/
```

---

## 4. Provider Plugin Interface

Production code uses **Effect-TS** for `install`, `uninstall`, and hook handlers (structured errors + `Context`/`Layer` DI). Promise façades exist only at absolute host boundaries (Express / MCP SDK).

```typescript
// packages/clawql-core/src/plugin/provider-types.ts

export interface ProviderPlugin {
  id: string;
  version: string;
  description: string;

  /** Tools registered with search/execute. Optional — hooks-only is valid (Panguard). */
  tools?: ToolDefinition[];

  /** Procedural skills bundled with this provider (§6). */
  skills?: SkillDefinition[];

  /** System self-knowledge ingested at install, tagged with plugin id (§6.3). */
  vaultSeed?: VaultSeedEntry[];

  /** Lifecycle hooks (§5). */
  hooks?: LifecycleHook[];

  install(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;

  uninstall(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;
}
```

Helpers: `defineProviderPlugin`, `defineRegisteringProviderPlugin` (env-gated tool registration at install time). See §12 for the 8.0 hard break — Phase-2 `Plugin` / `onRegister` / `beforeCallTool` is removed.

---

## 5. Hooks: Lifecycle Model and Security Invariants

### 5.1 Lifecycle Scopes

Hooks fire at one of three scopes, matching how the broader agent-tooling ecosystem has converged on Agent / Model / Tool layering:

```typescript
export type LifecycleScope = "tool" | "model" | "session";

export type LifecycleEvent =
  | "pre-execute" // tool: before a tool call runs
  | "post-execute" // tool: after return, before result enters agent context
  | "pre-ingest" // tool: before IDP/vault pipeline ingest
  | "on-deny" // tool: when a tool call is blocked
  | "pre-model" // model: before prompt is sent to LLM
  | "post-model" // model: after response, before re-entering context
  | "session-start"
  | "session-end";

export interface LifecycleHook {
  id: string;
  scope: LifecycleScope;
  event: LifecycleEvent;
  toolPattern?: string; // regex; required for 'tool' scope
  blocking: boolean; // required true for enforcement hooks (§5.3)
  handler: (
    ctx: HookContext
  ) => Effect.Effect<HookResult, ClawQLError | SecurityError | Error, HookRuntimeServices>;
}
```

Regex `toolPattern` avoids the exact-match trap where `"github"` fails to match `"github.pulls.merge"`.

### 5.2 Hooks Can Restrict, Never Loosen — the Core Invariant

A hook's result may narrow what a session is permitted to do. It may never widen it. Enforced in **`clawql-core`'s own `fireHook`**, not in any provider:

```typescript
// packages/clawql-core/src/plugin/hook-runtime.ts

export function fireHook(
  hook: LifecycleHook & { pluginId: string },
  ctx: HookContext
): Effect.Effect<HookResult, ClawQLError | SecurityError | Error, WormAuditSink> {
  // 1. Run handler
  // 2. If attemptedGrant is not ⊆ session.atrScope → HOOK_SCOPE_VIOLATION_BLOCKED + SecurityError
  // 3. Else → HOOK_TRIGGERED
}
```

`HookResult.attemptedGrant` lists scope tokens the hook tries to add; they must already be in the session ATR. **`HOOK_SCOPE_VIOLATION_BLOCKED`** is a distinct WORM entry type from **`HOOK_TRIGGERED`** — privilege escalation attempts are materially more serious than ordinary hook work.

Uninstalling Panguard removes Panguard's ATR/PII hooks only. Invariant 5.2 remains — it is not itself a hook.

### 5.3 Blocking, Not Async, for Enforcement Hooks

Enforcement hooks must be awaited before the gated action proceeds (`blocking: true`). A `pre-execute` hook that fires without blocking is not enforcement. Non-enforcement hooks (logging, notify) may be non-blocking.

MCP tool gating: `McpProxyPipeline` runs blocking `tool` / `pre-execute` hooks via `fireHooksForEvent` before handlers proceed.

### 5.4 Panguard as a Provider Plugin, Not a Dependency of clawql-core

Panguard installs like any other provider plugin — no special-casing in the loader. Reference shape in `packages/clawql-core/src/plugin/providers/panguard.ts` (`PanguardProviderPlugin`): hooks-only, blocking `pre-execute` / `pre-model` / `post-execute`.

Deployments that uninstall Panguard and install no replacement have chosen **no active tool-scope enforcement** — but no remaining hook can grant scope beyond declared ATR, because that check lives in core, not in Panguard.

Alternate enforcement (different PII model, jurisdiction policy, custom ATR) = another `ProviderPlugin` declaring hooks at the same lifecycle points. Core does not know which provider enforces; it only enforces invariant 5.2.

---

## 6. Skills and Vault-Seed: Bundled With Their Provider

### 6.1 Why Skills Travel With Their Provider's Tools

A provider's tools being callable is necessary but not sufficient. The documents/IDP provider illustrates the gap: `run_idp_pipeline` does not tell an agent when to route a scanned PDF differently, trust-layer semantics for NULL fields, or signature-block OCR pitfalls. Bundling skills + vault-seed with tools means capability and operating manual install atomically and cannot drift apart.

### 6.2 Skill and Vault-Seed Definitions

```typescript
export interface SkillDefinition {
  skillId: string;
  content: string; // SKILL.md body
  purposeTrace?: string;
  applicability?: "always" | "query-matched"; // standalone skills only (§7)
}

export interface VaultSeedEntry {
  title: string;
  content: string;
  ontologyType: string;
  // Tagged with owning plugin id at install — not set by plugin authors
}
```

### 6.3 Reversibility Is a Hard Requirement

Vault-seed is ordinary tagged vault memory. Uninstall must remove tools, skills, vault-seed, and hooks by plugin id — no orphans. Incomplete uninstall accumulates silent drift; WORM-audited systems must not hide that.

### 6.4 Discovery Through search, Not a Separate Mechanism

Skills surface through the same `search` ranking as tool operations (§8). ATR scope on tools implicitly governs bundled skill visibility — no separate skill-permission model.

---

## 7. Standalone Skills: Generic Utility With No Owning Provider

### 7.1 The Gap This Fills

Not every useful skill belongs to a domain ("summarize this session for handoff", "compress a long trajectory"). Forcing these into a fake provider is the wrong model.

### 7.2 Standalone Skill Plugins

```typescript
export interface StandaloneSkillPlugin {
  id: string;
  version: string;
  description: string;
  skills: SkillDefinition[];
  vaultSeed?: VaultSeedEntry[];
  install(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;
  uninstall(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;
}
```

Never `tools` or `hooks`. Lives under `plugins/skills/…`.

### 7.3 Discovery for Standalone Skills

Standalone skills need explicit visibility — they inherit no tool-scope:

- **`always`** — index entry eligible on every `search` pass (cheap; full content still fetched on demand — §8).
- **`query-matched`** — index entry only when query matches (default, safer).

### 7.4 Same Governance

Identical install/uninstall/WORM audit as provider plugins. Only difference: no tool-scope to inherit visibility from.

---

## 8. Skill Discovery: A Two-Tier Index, Inspired by Skills-over-MCP

### 8.1 Why This Section Exists

§6.4 and §7.3 gesture at discovery through `search` without specifying mechanism. Long-running deployments need a real answer: rank against lightweight index entries, not full skill bodies every time. Lineage: **Skills-over-MCP** (SEP-2640) `skills/list` + `skills/get` — not WikiSkill's "inject full bodies at inference" model.

### 8.2 The Index and the Content Are Different Objects

```typescript
export interface SkillIndexEntry {
  skillId: string;
  name: string;
  description: string;
  digest: string; // content hash — invalidates caches on edit
  pluginId: string;
  applicability: SkillApplicability;
}

export interface SkillContent {
  skillId: string;
  pluginId: string;
  digest: string;
  body: string;
  purposeTrace?: string;
}
```

`search` ranks index entries. Full `SkillContent` loads only when a skill is selected — parallel to `search` ops vs `execute`.

### 8.3 The Digest Is What Makes This Safe to Cache

Clients (or core cache) compare digest before re-fetching full content after edits.

### 8.4 Interoperability With Native Skills-over-MCP

Expose MCP tools:

| Tool          | Returns             |
| ------------- | ------------------- |
| `skills_list` | `SkillIndexEntry[]` |
| `skills_get`  | `SkillContent` body |

Same underlying store serves `search`/`execute`-mediated agents and native Skills-over-MCP clients (Codex, ChatGPT, …).

### 8.5 Applicability After the Index/Content Split

`always` only adds a lightweight index entry to every ranking pass — not full content in context. Operator-curated universal skills (e.g. handoff) are cheaper to mark `always` than when full bodies were assumed in scope.

---

## 9. Cold-Start Test Coverage: Synthesizing Scenarios From the Plugin Spec Alone

### 9.1 The Gap This Addresses

Every provider plugin declares `tools` with typed schemas (§4), but a newly installed plugin has no test coverage. Hand-authoring multi-turn eval scenarios for customer APIs, WebMCP sources, or third-party `ProviderPlugin`s does not scale.

Research (Karumuri, Vemula & Pegna, Apple, "Agent Seer," arXiv:2608.26133) shows MCP tool specs alone — names, descriptions, parameter schemas — contain enough signal for LLMs to synthesize realistic graded scenarios with synthetic tool outputs, without live execution. This matches `ToolDefinition` shape closely.

### 9.2 Optional Scenario Synthesis at Install Time

**Optional**, best-effort — does not touch §5 hook invariants, §6–8 discovery, or WORM governance paths. Install/uninstall does not depend on it.

```typescript
export interface ScenarioSynthesisRequest {
  pluginId: string;
  tools: ToolDefinition[];
  gradedComplexity?: ("simple" | "multi-tool")[];
  multiTurn?: boolean;
}

export interface SynthesizedScenario {
  scenarioId: string;
  userIntent: string;
  expectedToolSequence: { toolId: string; args: Record<string, unknown> }[];
  mockToolOutputs: Record<string, unknown>[];
  turns?: SynthesizedTurn[];
}
```

Output feeds `clawql-harness` comparison benchmarks (`harness-bench.ts`) as a cold-start task source for newly installed providers.

### 9.3 Optional `parameterNotes` on ToolDefinition

Agent Seer: argument value accuracy dominates failure mode. Optional per-parameter usage notes improve both hand-written and synthesized eval quality:

```typescript
export interface ToolDefinition {
  // ... id, description, inputSchema, handler, etc.
  parameterNotes?: Record<string, string>;
}
```

Purely additive — existing plugins unaffected.

### 9.4 Honest Limitations

Ground truth in synthesized scenarios is LLM-generated. Multi-turn mock outputs may break referential integrity. Methodology is demonstrated, not battle-hardened. Synthesized scenarios suit **first-pass cold-start coverage** only — not publishable quality claims without hand-verified benchmarks (Harvey LAB, ExtractBench discipline).

---

## 10. Non-Negotiable Security Invariants — Summary

These hold regardless of which plugins are installed, cannot be disabled by any plugin including Panguard, and are not configuration options:

1. **No hook may grant scope beyond the session's declared ATR** — enforced in core `fireHook` (§5.2), not provider logic.
2. **Violation → `HOOK_SCOPE_VIOLATION_BLOCKED` + hard reject** — no partial success, no silent ignore.
3. **Every hook firing produces a WORM entry** — no quiet path.
4. **Plugin install/uninstall are WORM-audited configuration events** — provider and standalone skill plugins alike.
5. **Uninstall is fully reversible** — no orphaned tools, skills, vault-seed, or hooks.
6. **`clawql-core` has no dependency on Panguard** — absence of enforcement is an explicit deployment choice; invariant 1 is not a hook and cannot be removed by uninstalling hooks.

Boot **SECURITY WARNING** when zero blocking enforcement is active (8.0+ default-off); silence only with `CLAWQL_ALLOW_NO_ENFORCEMENT=1` if intentional.

---

## 11. Effect-TS and Dependency Isolation (clarifications)

### 11.1 Zero-import-if-not-installed

**`optionalDependencies` + dynamic `import()`** — not Effect Layers alone. Layers compose the live graph; they do not keep unused packages out of the static import graph.

### 11.2 What Effect adds

- Typed errors on install/uninstall/handlers
- `Context` / `Layer` — `fireHook` requires `WormAuditSink` in context
- Structured concurrency for parallel installs / hook chains
- Shared Schema/error stack across plugins

### 11.3 What Effect does not solve

- ATR never-loosen (runtime in `fireHook`)
- Uninstall completeness (plugin-author responsibility)
- Blocking-enforcement policy (orchestration)

### 11.4 Spec requirement

`ProviderPlugin.install` / `uninstall` and `LifecycleHook.handler` **must** be Effects in production code. Security invariants remain **runtime checks in `clawql-core`**.

---

## 12. Hard break (8.0) — no compatibility bridge

Phase-2 `Plugin` / `onRegister` / `beforeCallTool` / `kind: "mcp-proxy"` is **removed**. There is no `legacyPluginToProviderPlugin`. Breaking release means **rewrite** against `ProviderPlugin` / `StandaloneSkillPlugin` — not adapt-old-plugins shims. See [migrate-to-8.0.md](../getting-started/migrate-to-8.0.md).

In-tree packages ship only the new shape. Third-party plugins must migrate before upgrading to 8.0.

---

_clawql-core Plugin Architecture Specification · v0.1 · August 2026_  
_Location: `packages/clawql-core/` · Contact: daniel@clawql.com_
