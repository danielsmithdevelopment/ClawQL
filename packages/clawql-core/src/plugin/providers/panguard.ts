/**
 * Reference Panguard provider plugin — hooks only, no tools.
 * Real deployments may use packages/panguard-mcp-bridge; this is the 8.0 shape.
 * clawql-core does NOT depend on @panguard-ai — handlers are injectable stubs.
 */

import { Effect } from "effect";
import { defineProviderPlugin } from "../plugin-installer.js";
import type { HookContext, HookResult, LifecycleHook, ProviderPlugin } from "../provider-types.js";

const allow: HookResult = { allow: true };

function atrEnforce(ctx: HookContext): Effect.Effect<HookResult, never> {
  // Baseline: deny if session ATR is empty and a tool is being called (explicit no-scope).
  // Real Panguard replaces this handler via a thicker provider package.
  if (ctx.toolName && ctx.session.atrScope.size === 0) {
    return Effect.succeed({
      allow: false,
      denyReason: "ATR scope empty — no tools permitted",
    });
  }
  return Effect.succeed(allow);
}

function passthrough(_ctx: HookContext): Effect.Effect<HookResult, never> {
  return Effect.succeed(allow);
}

const atrHook: LifecycleHook = {
  id: "atr-scope-enforce",
  scope: "tool",
  event: "pre-execute",
  toolPattern: ".*",
  blocking: true,
  handler: (ctx) => atrEnforce(ctx),
};

const piiModelHook: LifecycleHook = {
  id: "pii-autoredact-model",
  scope: "model",
  event: "pre-model",
  blocking: true,
  handler: (ctx) => passthrough(ctx),
};

const piiToolHook: LifecycleHook = {
  id: "pii-autoredact-tool-result",
  scope: "tool",
  event: "post-execute",
  toolPattern: ".*",
  blocking: true,
  handler: (ctx) => passthrough(ctx),
};

/** Hooks-only reference provider plugin (Panguard shape). */
export const PanguardProviderPlugin: ProviderPlugin = defineProviderPlugin({
  id: "panguard",
  version: "1.0.0",
  description: "Infrastructure-layer ATR scope enforcement and PII autoredaction (reference)",
  hooks: [atrHook, piiModelHook, piiToolHook],
});
