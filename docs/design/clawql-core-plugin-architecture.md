---
title: "clawql-core Plugin Architecture — Providers, Tools, Hooks, Skills"
status: "August 2026"
version: "0.1"
package: "packages/clawql-core/"
---

# clawql-core Plugin Architecture

## Providers, Tools, Hooks, Skills — Specification v0.1

**August 2026**

**Action items:** [clawql-8.0-plugin-architecture-action-items.md](./clawql-8.0-plugin-architecture-action-items.md) · **Migration:** [migrate-to-8.0.md](../getting-started/migrate-to-8.0.md)

---

## 1. Purpose

This document specifies how `clawql-core` composes four distinct kinds of pluggable content — **tools**, **hooks**, **skills**, and **vault-seed knowledge** — into a single discoverable, governable surface reachable through the existing `search`/`execute` primitives. It also specifies the security invariants that hold regardless of which plugins are installed, and cannot be disabled, weakened, or opted out of by any plugin, including Panguard itself.

This is a `clawql-core` specification, not a `clawql-harness` or `clawql-agents` one. The distinction matters and is easy to blur:

- **`clawql-harness`** wraps execution _loops_ a model runs inside of (Ouroboros, OpenCode2). It has nothing to do with what's described here.
- **`clawql-agents`** wraps finished agent _products_ (Hermes, Cline). Also unrelated to this spec.
- **`clawql-core`** is where "any API becomes MCP" lives — the provider/tool/hook/skill architecture described here is a direct extension of that responsibility, not a new layer.

---

## 2. The Four Content Kinds

Every unit of pluggable content in `clawql-core` is one of these four kinds. A single plugin may declare any combination.

| Kind           | What it is                                              | Who consumes it                  | Executable?                             |
| -------------- | ------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| **Tool**       | A callable operation registered with `search`/`execute`   | An agent, by calling it          | Yes                                     |
| **Hook**       | Provider-declared logic at a fixed lifecycle point      | `clawql-core`'s firing mechanism | Yes (never called directly by an agent) |
| **Skill**      | Procedural knowledge — instructions, not code           | An agent, by reading it          | No — informs, doesn't execute           |
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

```typescript
// packages/clawql-core/src/plugin/provider-types.ts

export interface ProviderPlugin {
  id: string;
  version: string;
  description: string;

  /**
   * Tools this provider registers with search/execute.
   * Optional — a provider plugin need not expose any tools (Panguard).
   */
  tools?: ToolDefinition[];

  /**
   * Procedural skills bundled with this provider. Travel with the
   * provider's tools as one distributable unit — see §6.
   */
  skills?: SkillDefinition[];

  /**
   * System self-knowledge, ingested into the vault at install time,
   * following the whitepaper's system-self-knowledge pattern: ordinary,
   * tagged, deletable vault content, not a privileged mechanism.
   */
  vaultSeed?: VaultSeedEntry[];

  /**
   * Lifecycle hooks this provider registers. See §5 for the full
   * lifecycle model and the non-negotiable invariants around them.
   */
  hooks?: LifecycleHook[];

  /**
   * Called once at plugin installation. Wires tools into search/execute,
   * ingests vaultSeed entries (tagged with this plugin's id), registers
   * skills, and registers hooks with clawql-core's firing mechanism.
   */
  install(ctx: PluginContext): Promise<void>;

  /**
   * Called on plugin removal. Must cleanly reverse everything install()
   * did — deregister tools, delete vault-seed entries by tag, remove
   * skills from the discovery index, deregister hooks. Reversibility is
   * a hard requirement, not a nice-to-have (see §6.3).
   */
  uninstall(ctx: PluginContext): Promise<void>;
}
```

**ClawQL 8.0 implementation:** `install` / `uninstall` / hook `handler` are **Effect** programs in production (`Effect.Effect<…, PluginInstallError, PluginInstallServices>`). Promise façades exist only at absolute host boundaries (Express / MCP SDK). Helpers: `defineProviderPlugin`, `defineRegisteringProviderPlugin`.

---

## 5. Hooks: Lifecycle Model and Security Invariants

### 5.1 Lifecycle Scopes

Hooks fire at one of three distinct scopes, matching how the broader agent-tooling ecosystem has independently converged on the same layering (Agent / Model / Tool):

```typescript
export type LifecycleScope =
  | "tool" // fires around a specific tool call
  | "model" // fires around every LLM call — PII redaction, injection detection, token tracking
  | "session"; // fires at session start/end — the whole "turn"

export type LifecycleEvent =
  | "pre-execute" // tool scope: before a tool call runs
  | "post-execute" // tool scope: after return, before result enters agent context
  | "pre-ingest" // tool scope: before IDP/vault pipeline ingest
  | "on-deny" // tool scope: when a tool call is blocked
  | "pre-model" // model scope: before prompt is sent to the LLM
  | "post-model" // model scope: after response, before re-entering context
  | "session-start"
  | "session-end";

export interface LifecycleHook {
  id: string;
  scope: LifecycleScope;
  event: LifecycleEvent;
  toolPattern?: string; // regex, required for 'tool' scope — avoids exact-match traps
  // on namespaced IDs like "github.pulls.merge"
  handler: (ctx: HookContext) => Promise<HookResult>;
  blocking: boolean; // must be true for enforcement hooks (§5.3)
}
```

### 5.2 Hooks Can Restrict, Never Loosen — the Core Invariant

A hook's result may narrow what a session is permitted to do. It may never widen it. This holds for every hook from every provider plugin, without exception, and is enforced by `clawql-core` itself — not by any individual provider, not by Panguard, not by anything optional.

```typescript
// packages/clawql-core/src/plugin/hook-runtime.ts

/**
 * clawql-core's own hook-firing mechanism. NOT swappable, NOT provider-owned,
 * exists regardless of which (if any) enforcement provider is installed.
 */
export async function fireHook(hook: LifecycleHook, ctx: HookContext): Promise<HookResult> {
  const result = await hook.handler(ctx);

  // Conceptual: reject if hook attempts scope beyond session ATR.
  if (result.grantsBeyond(ctx.session.atrScope)) {
    await worm.append({
      type: "HOOK_SCOPE_VIOLATION_BLOCKED",
      hookId: hook.id,
      pluginId: hook.pluginId,
      sessionId: ctx.session.id,
      attemptedGrant: result.attemptedScope,
      declaredScope: ctx.session.atrScope,
      timestamp: new Date().toISOString(),
    });
    throw new SecurityError(
      `Hook ${hook.id} attempted to grant scope beyond session ATR — rejected`
    );
  }

  await worm.append({
    type: "HOOK_TRIGGERED",
    hookId: hook.id,
    pluginId: hook.pluginId,
    scope: hook.scope,
    event: hook.event,
    sessionId: ctx.session.id,
    result: summarizeForAudit(result),
    timestamp: new Date().toISOString(),
  });

  return result;
}
```

**Implementation (8.0):** `HookResult.attemptedGrant` lists scope tokens the hook proposes to add; `fireHook` rejects when any token is not already in `session.atrScope` (`grantsWithinAtr`) — equivalent to `grantsBeyond` above. WORM fields use `attemptedGrant` and `declaredScope` token lists.

**`HOOK_SCOPE_VIOLATION_BLOCKED` is a distinct WORM entry type from `HOOK_TRIGGERED`**, deliberately, because a hook attempting to escalate its own privileges is a materially more serious event than a hook doing its ordinary job.

### 5.3 Blocking, Not Async, for Enforcement Hooks

Any hook that participates in enforcement (i.e., anything Panguard or an equivalent registers) must be synchronous and awaited by `clawql-core`'s firing mechanism before the tool call it gates is permitted to proceed. A `pre-execute` enforcement hook that fires asynchronously and doesn't block the tool call is not enforcement — it's a side effect that happens to run near the same time. `blocking: true` is required for enforcement hooks: it is the difference between a guarantee and a suggestion.

Non-enforcement hooks (logging, notify) may be non-blocking. MCP tool gating: `McpProxyPipeline` awaits blocking `tool` / `pre-execute` hooks via `fireHooksForEvent` before handlers proceed.

### 5.4 Panguard as a Provider Plugin, Not a Dependency of clawql-core

Panguard is installed the same way any other provider plugin is installed — no special-casing exists in `clawql-core`'s plugin loader. Panguard's plugin declares hooks (baseline ATR scope enforcement at `tool` scope, PII autoredaction at `model` and `tool` scope) and, in most configurations, no tools of its own.

```typescript
// packages/clawql-core/src/plugin/providers/panguard.ts

export const PanguardProvider: ProviderPlugin = {
  id: "panguard",
  version: "1.0.0",
  description: "Infrastructure-layer ATR scope enforcement and PII autoredaction",

  hooks: [
    {
      id: "atr-scope-enforce",
      scope: "tool",
      event: "pre-execute",
      toolPattern: ".*",
      blocking: true,
      handler: enforceAtrScope,
    },
    {
      id: "pii-autoredact-model",
      scope: "model",
      event: "pre-model",
      blocking: true,
      handler: redactPiiFromPrompt,
    },
    {
      id: "pii-autoredact-tool-result",
      scope: "tool",
      event: "post-execute",
      toolPattern: ".*",
      blocking: true,
      handler: redactPiiFromToolResult,
    },
  ],

  async install(ctx) {
    // Registers hooks with clawql-core's firing mechanism.
    // No tools. No vault-seed by default.
  },

  async uninstall(ctx) {
    // Deregisters hooks. §5.2 invariant remains — it lives in core, not Panguard.
  },
};
```

**Because §5.2's invariant lives in `clawql-core`'s own firing mechanism and not in Panguard's code, uninstalling Panguard does not remove the guarantee that hooks cannot loosen scope — it only removes Panguard's own baseline ATR enforcement and PII redaction hooks.** A deployment that uninstalls Panguard and installs no replacement enforcement provider has, correctly, chosen to run with no active tool-scope enforcement at all — but even in that configuration, no hook from any remaining provider can grant scope beyond what a session already declared.

**A deployment that wants different enforcement logic** installs a different provider plugin declaring its own hooks at the same lifecycle points, in place of or alongside Panguard's. `clawql-core` does not know or care which provider is enforcing anything; it only knows that whatever hooks fire cannot widen a session's declared scope.

In-process Panguard proxy enforcement in `clawql-api` (`createPanguardProxyPlugin`) is the same shape: blocking `pre-execute` hooks, not a separate `beforeCallTool` path.

---

## 6. Skills and Vault-Seed: Bundled With Their Provider

### 6.1 Why Skills Travel With Their Provider's Tools

A provider's tools being callable is necessary but not sufficient for an agent to use them well. The documents/IDP provider is the clearest illustration: `run_idp_pipeline` being registered doesn't tell an agent when to route a scanned PDF differently from a text-based one, doesn't convey the trust-layer semantics for a NULL extracted field, doesn't warn against OCR-ing a signature block as text. A provider plugin that ships only tools is a capability with no operating manual. Bundling skills and vault-seed content into the same plugin as the tools they accompany means installing the capability and installing the knowledge of how to use it well happen as one atomic action, and neither can silently drift out of sync with the other the way a separately-maintained skill library could.

### 6.2 Skill and Vault-Seed Definitions

```typescript
export interface SkillDefinition {
  skillId: string;
  content: string; // the SKILL.md body
  purposeTrace?: string;
}

export interface VaultSeedEntry {
  title: string;
  content: string;
  ontologyType: string;
  // Tagged automatically with the owning plugin's id at install time —
  // not something a plugin author sets manually.
}
```

### 6.3 Reversibility Is a Hard Requirement

Vault-seed content is ordinary, tagged, deletable vault memory — never architecturally special. Installing a provider plugin registers its skills into the discovery index tagged with the plugin's id; uninstalling must remove them cleanly, with no orphaned skill or vault entry left behind. Incomplete uninstall accumulates silent drift — exactly what a WORM-audited system is supposed to make impossible to hide.

### 6.4 Discovery Through search, Not a Separate Mechanism

Skills are surfaced through the same `search` call that already ranks tool operations:

```typescript
await search({ query: "review this pull request" });
// operations: github.pulls.get, github.pulls.listReviews, ...
// skills: pr-review-checklist, ...
// ranked by relevance, filtered by session ATR scope
```

A session's ATR scope determines which provider plugins' tools it can call. Because skills are bundled per-provider, scope implicitly governs bundled skill visibility too — there is no separate skill-permission model.

---

## 7. Standalone Skills: Generic Utility With No Owning Provider

### 7.1 The Gap This Fills

Not every useful skill belongs to a domain. "Summarize this session for a handoff" or "compress a long trajectory into a structured recap" are generically useful regardless of which providers a session has in scope. Forcing these into a provider plugin's shape would mean inventing a fake provider — the wrong model.

### 7.2 Standalone Skill Plugins

A standalone skill plugin declares skills and, optionally, vault-seed content, but never tools and never hooks.

```typescript
export interface StandaloneSkillPlugin {
  id: string;
  version: string;
  description: string;
  skills: SkillDefinition[];
  vaultSeed?: VaultSeedEntry[];

  install(ctx: PluginContext): Promise<void>;
  uninstall(ctx: PluginContext): Promise<void>;
}
```

```
plugins/skills/
  handoff/
  session-summarizer/
  debugging-checklist/
```

### 7.3 Discovery for Standalone Skills

Standalone skills need explicit visibility — they inherit no tool-scope:

```typescript
export interface SkillDefinition {
  skillId: string;
  content: string;
  purposeTrace?: string;
  // Only for standalone skills (provider-bundled skills inherit tool-scope).
  applicability?: "always" | "query-matched";
}
```

`always` — eligible on every `search` ranking pass (index entry only until fetched — §8). `query-matched` — index entry only when the query matches (default, safer).

### 7.4 Standalone Skills Still Go Through the Same Governance

Identical install/uninstall/WORM audit as provider plugins (§6.3). The only difference: no tool-scope to inherit discovery visibility from.

---

## 8. Skill Discovery: A Two-Tier Index, Inspired by Skills-over-MCP

### 8.1 Why This Section Exists Separately From §6.4 and §7.3

§6.4 and §7.3 gesture at discovery through `search` without specifying mechanism. Long-running deployments need a real answer: rank against lightweight index entries, not full bodies every time.

WikiSkill injects full skill bodies at inference — not this model. The two-tier mechanism here is informed by **Skills-over-MCP** (SEP-2640): lightweight list metadata + digest, full content on demand — adapted for `search`/`execute` rather than a third parallel interface.

### 8.2 The Index and the Content Are Different Objects

```typescript
export interface SkillIndexEntry {
  skillId: string;
  name: string;
  description: string;
  digest: string;
  pluginId: string;
}

export interface SkillContent {
  skillId: string;
  content: string; // full SKILL.md body — fetched on demand
  purposeTrace?: string;
}
```

```typescript
await search({ query: "review this pull request" });
// → index entries + ranked tool operations

await fetchSkillContent({ skillId: "pr-review-checklist" });
// → full SkillContent, injected into context only now
```

### 8.3 The Digest Is What Makes This Safe to Cache

Digest changes when a skill is edited — stale cached copies are detectable without re-fetching full content.

### 8.4 Interoperability With Native Skills-over-MCP Clients

Expose the same two surfaces natively:

```
skills/list   → SkillIndexEntry[] (name, description, digest)
skills/get    → SkillContent for a skillId
```

**Shipped MCP tools (8.0):** `skills_list`, `skills_get` — same store, snake_case tool names.

One skill library serves `search`/`execute`-mediated agents and external Skills-over-MCP-aware clients without duplication.

### 8.5 What §7.3's `applicability` Field Resolves, Now That Fetching Is Cheap

With the index/content split, `applicability` governs index eligibility, not full-body context cost. `always` adds a lightweight index row to every ranking pass; `query-matched` restricts index surfacing. Operator-curated universal skills (e.g. handoff) are safe to mark `always` more liberally than when full bodies were assumed in scope.

---

## 9. Cold-Start Test Coverage: Synthesizing Scenarios From the Plugin Spec Alone

### 9.1 The Gap This Addresses

Every provider plugin declares `tools` with full typed schemas (§4) — but a newly installed plugin has no test coverage. Hand-authoring multi-tool, multi-turn evaluation scenarios for a new provider does not scale.

Research (Karumuri, Vemula & Pegna, Apple, "Agent Seer," arXiv:2608.26133) shows MCP tool specifications alone contain enough semantic information for LLMs to synthesize realistic graded scenarios with synthetic tool outputs, without live execution — a close match to `ToolDefinition`.

### 9.2 Optional Scenario Synthesis as a Plugin-Install-Time Capability

**Optional**, best-effort — does not touch §5 hook invariants, §6–8 discovery, or WORM paths. Install/uninstall does not depend on it.

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

Output feeds `clawql-harness` comparison benchmarks (`harness-bench.ts`) as a cold-start task source.

### 9.3 One Small Addition to ToolDefinition Worth Making Now

Argument value accuracy — not tool selection — is the dominant failure mode in Agent Seer-style synthesis. Optional per-parameter notes improve eval quality:

```typescript
export interface ToolDefinition {
  // ... existing fields (id, description, inputSchema, etc.)
  parameterNotes?: Record<string, string>;
}
```

Purely additive — existing plugins unaffected; no structural plugin-interface rewrite required.

### 9.4 Honest Limitations

Ground truth is LLM-generated. Multi-turn mock outputs may break referential integrity. Methodology is demonstrated, not battle-hardened. Synthesized scenarios suit **first-pass cold-start coverage** only — not publishable quality claims without hand-verified benchmarks (Harvey LAB, ExtractBench discipline).

---

## 10. Non-Negotiable Security Invariants — Summary

These hold regardless of which plugins are installed, cannot be disabled by any plugin including Panguard, and are not configuration options:

1. **No hook may cause a session to gain scope beyond what it originally declared** — enforced in core `fireHook` (§5.2), not provider logic.
2. **Violation → `HOOK_SCOPE_VIOLATION_BLOCKED` + hard reject** — no partial success, no silent ignore.
3. **Every hook firing produces a WORM entry** — no quiet path.
4. **Plugin install and uninstall are WORM-audited configuration events** — provider and standalone skill plugins alike.
5. **Uninstall is fully reversible** — no orphaned tools, skills, vault-seed, or hooks.
6. **`clawql-core` has no dependency on Panguard** — absence of enforcement is an explicit deployment choice; invariant 1 is not a hook and cannot be removed by uninstalling hooks.

**8.0 deployment note:** boot emits a **SECURITY WARNING** when zero blocking `pre-execute` enforcement hooks are active (providers default off). Silence only with `CLAWQL_ALLOW_NO_ENFORCEMENT=1` if intentional.

---

## 11. Effect-TS and dependency isolation (implementation)

### 11.1 Zero-import-if-not-installed

`optionalDependencies` + dynamic `import()` — not Effect Layers alone. Layers compose the live graph; they do not keep unused packages out of the static import graph.

### 11.2 What Effect adds

- Typed errors on `install` / `uninstall` / handlers
- `Context` / `Layer` — `fireHook` requires `WormAuditSink` in context
- Structured concurrency for parallel installs and hook chains

### 11.3 What Effect does not solve

- ATR never-loosen (runtime in `fireHook`)
- Uninstall completeness (plugin-author responsibility)
- Blocking-enforcement orchestration policy

### 11.4 Requirement

Production `ProviderPlugin.install` / `uninstall` and `LifecycleHook.handler` **must** be Effects. Security invariants remain **runtime checks in `clawql-core`**.

---

## 12. Hard break (8.0) — no compatibility bridge

Phase-2 `Plugin` / `onRegister` / `beforeCallTool` / `kind: "mcp-proxy"` is **removed**. There is no `legacyPluginToProviderPlugin`. Breaking release means **rewrite** against `ProviderPlugin` / `StandaloneSkillPlugin`. See [migrate-to-8.0.md](../getting-started/migrate-to-8.0.md).

In-tree packages ship only the new shape. Third-party plugins must migrate before upgrading to 8.0.

---

_clawql-core Plugin Architecture Specification · v0.1 · August 2026_  
_Location: `packages/clawql-core/` · Contact: daniel@clawql.com_
