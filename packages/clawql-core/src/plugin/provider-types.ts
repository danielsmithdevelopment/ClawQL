/**
 * ClawQL 8.0 ProviderPlugin / skill / hook contracts.
 * @see docs/design/clawql-core-plugin-architecture.md
 */

import type { Effect } from "effect";
import { Context } from "effect";
import type { ClawQLError, McpToolAlreadyRegisteredError } from "../errors/clawql-error.js";
import type { ClawQLPluginRegistrationApi, McpToolDefinition } from "./registration-api.js";

/** Tool registered into search/execute (MCP tool boundary). */
export type ToolDefinition = McpToolDefinition;

export type SkillApplicability = "always" | "query-matched";

export type SkillDefinition = {
  readonly skillId: string;
  /** Full SKILL.md body. */
  readonly content: string;
  readonly purposeTrace?: string;
  /**
   * Standalone skills only — provider-bundled skills inherit visibility from tool ATR.
   * Default for standalone: `query-matched`.
   */
  readonly applicability?: SkillApplicability;
  readonly name?: string;
  readonly description?: string;
};

export type VaultSeedEntry = {
  readonly title: string;
  readonly content: string;
  readonly ontologyType: string;
};

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

/** Session ATR as opaque scope tokens (provider tool ids, patterns, or claim strings). */
export type AtrScope = ReadonlySet<string>;

export type HookSession = {
  readonly id: string;
  readonly atrScope: AtrScope;
};

export type HookContext = {
  readonly session: HookSession;
  readonly toolName?: string;
  readonly args?: unknown;
  readonly payload?: unknown;
};

/**
 * Hook outcome. `attemptedGrant` must be ⊆ session ATR — enforced by `fireHook`, not by Effect types.
 */
export type HookResult = {
  readonly allow: boolean;
  readonly denyReason?: string;
  /** Scope tokens this hook attempts to add — must already be in session ATR. */
  readonly attemptedGrant?: readonly string[];
  readonly redactedPayload?: unknown;
  readonly meta?: Record<string, unknown>;
};

export type LifecycleHook = {
  readonly id: string;
  readonly scope: LifecycleScope;
  readonly event: LifecycleEvent;
  /** Regex; required for `tool` scope. */
  readonly toolPattern?: string;
  /**
   * Enforcement hooks must be `true` and awaited before the gated action proceeds.
   * Non-enforcement (logging/notify) may be `false`.
   */
  readonly blocking: boolean;
  readonly handler: (
    ctx: HookContext
  ) => Effect.Effect<HookResult, ClawQLError | SecurityError | Error, HookRuntimeServices>;
};

/** Where the skill came from — drives ATR visibility on search (§6.4 / §7.3). */
export type SkillSourceKind = "provider" | "standalone";

/** Options when registering skills into the two-tier index. */
export type SkillRegisterOptions = {
  readonly source: SkillSourceKind;
  /**
   * Provider tool names / ATR tokens associated with this plugin.
   * Used to filter provider-bundled skills under session ATR.
   */
  readonly scopeTokens?: readonly string[];
};

/** Lightweight index row ranked by search / skills/list. */
export type SkillIndexEntry = {
  readonly skillId: string;
  readonly name: string;
  readonly description: string;
  /** Content digest for cache invalidation. */
  readonly digest: string;
  readonly pluginId: string;
  readonly applicability: SkillApplicability;
  /** Provider-bundled vs standalone — standalone ignores tool ATR. */
  readonly source: SkillSourceKind;
  /** Provider tool names used for ATR matching (provider skills only). */
  readonly scopeTokens?: readonly string[];
};

export type SkillContent = {
  readonly skillId: string;
  readonly pluginId: string;
  readonly digest: string;
  readonly body: string;
  readonly purposeTrace?: string;
};

export type PluginContext = {
  readonly registrationApi: ClawQLPluginRegistrationApi;
  readonly pluginId: string;
};

export type PluginInstallError = ClawQLError | SecurityError | McpToolAlreadyRegisteredError;

/** Ports required by install/uninstall (provided via Layer). */
export type PluginInstallServices = SkillRegistry | VaultSeedPort | HookRegistry | WormAuditSink;

export type HookRuntimeServices = WormAuditSink;

export class SecurityError {
  readonly _tag = "SecurityError" as const;
  constructor(readonly reason: string) {}
}

export function isSecurityError(e: unknown): e is SecurityError {
  return (
    typeof e === "object" &&
    e !== null &&
    "_tag" in e &&
    (e as { _tag: string })._tag === "SecurityError"
  );
}

export type WormAuditEvent =
  | {
      readonly type: "HOOK_TRIGGERED";
      readonly hookId: string;
      readonly pluginId: string;
      readonly scope: LifecycleScope;
      readonly event: LifecycleEvent;
      readonly sessionId: string;
      readonly resultSummary: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "HOOK_SCOPE_VIOLATION_BLOCKED";
      readonly hookId: string;
      readonly pluginId: string;
      readonly sessionId: string;
      readonly attemptedGrant: readonly string[];
      readonly declaredScope: readonly string[];
      readonly timestamp: string;
    }
  | {
      readonly type: "PLUGIN_INSTALL";
      readonly pluginId: string;
      readonly version: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "PLUGIN_UNINSTALL";
      readonly pluginId: string;
      readonly version: string;
      readonly timestamp: string;
    };

export class WormAuditSink extends Context.Tag("clawql/WormAuditSink")<
  WormAuditSink,
  {
    readonly append: (event: WormAuditEvent) => Effect.Effect<void, never>;
  }
>() {}

export class SkillRegistry extends Context.Tag("clawql/SkillRegistry")<
  SkillRegistry,
  {
    readonly register: (
      pluginId: string,
      skills: readonly SkillDefinition[],
      options?: SkillRegisterOptions
    ) => Effect.Effect<void, ClawQLError>;
    readonly unregisterPlugin: (pluginId: string) => Effect.Effect<void, never>;
    readonly listIndex: () => Effect.Effect<readonly SkillIndexEntry[], never>;
    readonly getContent: (skillId: string) => Effect.Effect<SkillContent | undefined, never>;
  }
>() {}

export class HookRegistry extends Context.Tag("clawql/HookRegistry")<
  HookRegistry,
  {
    readonly register: (
      pluginId: string,
      hooks: readonly LifecycleHook[]
    ) => Effect.Effect<void, ClawQLError>;
    readonly unregisterPlugin: (pluginId: string) => Effect.Effect<void, never>;
    readonly list: (
      event: LifecycleEvent,
      toolName?: string
    ) => Effect.Effect<readonly RegisteredHook[], never>;
  }
>() {}

export type RegisteredHook = LifecycleHook & { readonly pluginId: string };

export class VaultSeedPort extends Context.Tag("clawql/VaultSeedPort")<
  VaultSeedPort,
  {
    readonly ingestTagged: (
      pluginId: string,
      entries: readonly VaultSeedEntry[]
    ) => Effect.Effect<void, ClawQLError>;
    readonly deleteByPluginTag: (pluginId: string) => Effect.Effect<void, ClawQLError>;
  }
>() {}

/**
 * Installable provider domain artifact (tools + skills + vault-seed + hooks).
 * Panguard is a valid provider plugin with hooks only.
 */
export interface ProviderPlugin {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly tools?: readonly ToolDefinition[];
  readonly skills?: readonly SkillDefinition[];
  readonly vaultSeed?: readonly VaultSeedEntry[];
  readonly hooks?: readonly LifecycleHook[];
  readonly install: (
    ctx: PluginContext
  ) => Effect.Effect<void, PluginInstallError, PluginInstallServices>;
  readonly uninstall: (
    ctx: PluginContext
  ) => Effect.Effect<void, PluginInstallError, PluginInstallServices>;
}

/** Generic utility skills with no owning provider domain. */
export interface StandaloneSkillPlugin {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly skills: readonly SkillDefinition[];
  readonly vaultSeed?: readonly VaultSeedEntry[];
  readonly install: (
    ctx: PluginContext
  ) => Effect.Effect<void, PluginInstallError, PluginInstallServices>;
  readonly uninstall: (
    ctx: PluginContext
  ) => Effect.Effect<void, PluginInstallError, PluginInstallServices>;
}

export type AnyPlugin = ProviderPlugin | StandaloneSkillPlugin;

/**
 * Standalone skill plugins declare `skills` and never declare `tools` or `hooks`.
 * Provider plugins may omit all four content kinds (hooks-only is valid).
 */
export function isStandaloneSkillPlugin(p: AnyPlugin): p is StandaloneSkillPlugin {
  const candidate = p as StandaloneSkillPlugin & ProviderPlugin;
  return (
    Array.isArray(candidate.skills) &&
    candidate.tools === undefined &&
    candidate.hooks === undefined
  );
}

export function isProviderPlugin(p: AnyPlugin): p is ProviderPlugin {
  return !isStandaloneSkillPlugin(p);
}
