import type { HookContext, HookResult, LifecycleHook } from "clawql-core";
import { Effect } from "effect";

import { TAILCAT_CONNECT_TOOL_PATTERN, TAILCAT_EPHEMERAL_ATR_SCOPE } from "./constants.js";

const allow: HookResult = { allow: true };

/**
 * Blocks tailcat unless session ATR explicitly includes `network:tailcat_ephemeral`.
 * @see docs/specs/network/clawql-network-v0.1.md §7
 */
export const tailcatConnectHook: LifecycleHook = {
  id: "tailcat-ephemeral-connect-gate",
  scope: "tool",
  event: "pre-execute",
  toolPattern: TAILCAT_CONNECT_TOOL_PATTERN,
  blocking: true,
  handler: (ctx: HookContext): Effect.Effect<HookResult, never> =>
    Effect.sync(() => {
      if (!ctx.session.atrScope.has(TAILCAT_EPHEMERAL_ATR_SCOPE)) {
        return {
          allow: false,
          denyReason: `tailcat requires explicit scope grant (${TAILCAT_EPHEMERAL_ATR_SCOPE})`,
        };
      }
      return allow;
    }),
};
