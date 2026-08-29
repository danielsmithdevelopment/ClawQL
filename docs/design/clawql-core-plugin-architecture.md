# clawql-core Plugin Architecture

## Providers, Tools, Hooks, Skills — Specification v0.1

**Status:** August 2026 · **Package:** `packages/clawql-core/` · **Release target:** ClawQL **8.0.0**

**Action items:** [clawql-8.0-plugin-architecture-action-items.md](./clawql-8.0-plugin-architecture-action-items.md)

---

## 1. Purpose

This document specifies how `clawql-core` composes four kinds of pluggable content — **tools**, **hooks**, **skills**, and **vault-seed knowledge** — into one discoverable, governable surface reachable through `search`/`execute` (and Skills-over-MCP). It also specifies security invariants that hold regardless of which plugins are installed and cannot be disabled by any plugin, including Panguard.

This is a **`clawql-core`** specification:

| Package          | Role                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| `clawql-harness` | Execution _loops_ (Ouroboros, OpenCode2) — unrelated                     |
| `clawql-agents`  | Finished agent _products_ — unrelated                                    |
| `clawql-core`    | “Any API becomes MCP” — provider/tool/hook/skill architecture lives here |

---

## 2. The Four Content Kinds

| Kind           | What it is                           | Who consumes it            | Executable?                             |
| -------------- | ------------------------------------ | -------------------------- | --------------------------------------- |
| **Tool**       | Callable op in `search`/`execute`    | Agent, by calling          | Yes                                     |
| **Hook**       | Logic at a fixed lifecycle point     | Core’s firing mechanism    | Yes (never called directly by an agent) |
| **Skill**      | Procedural instructions (`SKILL.md`) | Agent, by reading          | No                                      |
| **Vault-seed** | System self-knowledge at install     | Agent, via `memory_recall` | No                                      |

A plugin may declare any combination. A provider may ship tools with no skills. A skill may exist with no owning provider (§7). A hook-only provider (Panguard) is valid (§5.4).

---

## 3. Plugins vs Providers vs Provider Plugins

- **Plugin** — any installable unit.
- **Provider** — a domain (GitHub, documents, WebMCP, Panguard, …), not a code artifact.
- **Provider Plugin** — the installable artifact for a provider. Conventionally bundles tools + skills + vault-seed + hooks; may omit any.

Standalone skill plugins (§7) are plugins but not provider plugins.

```
plugins/
  providers/     — provider plugins (tools+skills+vault-seed+hooks per domain)
  skills/        — standalone skill plugins (no tools, no hooks)
```

---

## 4. Provider Plugin Interface

```typescript
export interface ProviderPlugin {
  id: string;
  version: string;
  description: string;
  tools?: ToolDefinition[];
  skills?: SkillDefinition[];
  vaultSeed?: VaultSeedEntry[];
  hooks?: LifecycleHook[];
  install(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;
  uninstall(ctx: PluginContext): Effect.Effect<void, PluginInstallError, PluginInstallServices>;
}
```

`install` / `uninstall` / hook `handler` are **Effects** (structured errors + `Context` requirements). See §10.

---

## 5. Hooks: Lifecycle Model and Security Invariants

### 5.1 Scopes and events

```typescript
export type LifecycleScope = "tool" | "model" | "session";

export type LifecycleEvent =
  | "pre-execute"
  | "post-execute"
  | "pre-ingest"
  | "on-deny"
  | "pre-model"
  | "post-model"
  | "session-start"
  | "session-end";
```

`toolPattern` (regex) is required for `tool` scope — avoids exact-match traps on namespaced IDs.

### 5.2 Hooks can restrict, never loosen

Enforced in **`clawql-core`’s own `fireHook`**, not in any provider:

- If a hook’s result attempts scope beyond the session’s declared ATR → append **`HOOK_SCOPE_VIOLATION_BLOCKED`**, throw `SecurityError`, do not proceed.
- Every successful fire → **`HOOK_TRIGGERED`**.
- These entry types are distinct on purpose.

Uninstalling Panguard removes Panguard’s ATR/PII hooks only. Invariant 5.2 remains — it is not itself a hook.

### 5.3 Blocking for enforcement

Enforcement hooks must be awaited before the gated action proceeds (`blocking: true`). Non-enforcement hooks (logging, notify) may be non-blocking.

### 5.4 Panguard as a provider plugin

Installed like any other provider plugin. Declares hooks (typically no tools). `clawql-core` has **no** dependency on Panguard. Alternate enforcement providers swap at the same lifecycle points.

---

## 6. Skills and Vault-Seed (bundled with provider)

Skills travel with their provider’s tools so capability + operating manual install atomically. Vault-seed is ordinary tagged vault memory (plugin id tag). Uninstall must reverse completely (§6.3 / §9.5). Skills surface through the same `search` ranking as tools (§8); ATR that hides a provider’s tools also hides its bundled skills.

---

## 7. Standalone Skills

Generic utility with no owning provider (`plugins/skills/…`). Never tools or hooks. Need `applicability: "always" | "query-matched"` because they inherit no tool-scope visibility. Same install/uninstall/WORM governance as provider plugins.

---

## 8. Skill Discovery — Two-Tier Index / Fetch

### 8.1 Lineage

Inspired by **Skills-over-MCP** (index vs content). This is **not** WikiSkill’s “inject full skill bodies at inference” model — agents discover lightweight index entries, then fetch full content only when selected.

### 8.2 Mechanism

| Tier    | Type              | Contents                                                      |
| ------- | ----------------- | ------------------------------------------------------------- |
| Index   | `SkillIndexEntry` | `skillId`, name, description, digest, applicability, pluginId |
| Content | `SkillContent`    | Full `SKILL.md` body + metadata                               |

`search` ranks against the **index**. Full body loads only on selection — parallel to `search` ops vs `execute`.

### 8.3 Digest

Content digest invalidates caches when a skill is edited (Skills-over-MCP versioning pattern).

### 8.4 Native Skills-over-MCP

Expose `skills/list` and `skills/get` so Codex / ChatGPT / other Skills-over-MCP clients can use the same store without going through `search`/`execute`. One skill store, two access paths.

### 8.5 Applicability cost

With the index/content split, `always`-visible skills only cost a lightweight index entry — safe for curated universal skills (e.g. handoff).

---

## 9. Non-Negotiable Security Invariants

1. No hook may grant scope beyond the session’s declared ATR — enforced in core `fireHook`.
2. Violation → `HOOK_SCOPE_VIOLATION_BLOCKED` + hard reject (no partial success).
3. Every hook firing produces a WORM entry (no quiet path).
4. Plugin install/uninstall are WORM-audited configuration events.
5. Uninstall is fully reversible (no orphans).
6. Core does not depend on Panguard; absence of an enforcement provider is an explicit deployment choice and does not weaken invariant 1.

---

## 10. Effect-TS and Dependency Isolation (clarifications)

### 10.1 What gives zero-import-if-not-installed

**`optionalDependencies` / peers + dynamic `import()`** (Node module resolution) — not Effect. Layers compose the _live_ graph; they do not keep an unused package out of `node_modules` or the static import graph. Disabled-but-statically-imported packages still load.

### 10.2 What Effect adds

- **Typed errors** on `install` / `uninstall` / handlers — failure modes visible; fits “no quiet failure.”
- **`Context` / `Layer`** — `fireHook` requires WORM sink + ATR checker in `R`; cannot run without them.
- **Structured concurrency** — parallel installs / hook fans without ad-hoc Promise races.
- Shared Schema / error / concurrency stack for plugins (smaller grab-bag attack surface).

### 10.3 What Effect does not solve

- ATR never-loosen (runtime check in `fireHook`).
- Uninstall completeness (plugin-author correctness).
- Blocking-enforcement policy (orchestration, not types).

### 10.4 Spec requirement

`ProviderPlugin.install` / `uninstall` and `LifecycleHook.handler` **must** be Effects. Security invariants remain **runtime checks in `clawql-core`**.

---

## 11. Hard break (8.0) — no compatibility bridge

Phase-2 `Plugin` / `onRegister` / `beforeCallTool` / `kind: "mcp-proxy"` is **removed**. There is no `legacyPluginToProviderPlugin`. Breaking release means rewrite against `ProviderPlugin` / `StandaloneSkillPlugin` (see [`migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md)).

In-tree packages ship only the new shape. Third-party plugins must do the same before upgrading.

---

_clawql-core Plugin Architecture Specification · v0.1 · August 2026_  
_Contact: daniel@clawql.com_
