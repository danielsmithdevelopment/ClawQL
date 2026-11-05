/**
 * Explicit MCP OAuth device-authorization state machine (RFC 8628).
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/oauth/OauthDeviceAuthorization.tla.
 */

import { Data, Effect } from "effect";

/** Device-code lifecycle — single source for the transition table. */
export type DeviceFlowStatus = "pending" | "approved" | "consumed" | "expired";

export type DeviceFlowEvent =
  | { readonly _tag: "Issue" }
  | { readonly _tag: "Approve" }
  | { readonly _tag: "Consume" }
  | { readonly _tag: "Expire" };

export class DeviceFlowIllegalTransition extends Data.TaggedError("DeviceFlowIllegalTransition")<{
  readonly from: DeviceFlowStatus;
  readonly event: DeviceFlowEvent["_tag"];
}> {}

export type DeviceFlowTransition = {
  readonly status: DeviceFlowStatus;
  /** Idempotent no-op (already approved / already expired). */
  readonly alreadyDone: boolean;
};

/** Map pre-issue `"none"` into a reportable status for IllegalTransition. */
function reportFrom(from: DeviceFlowStatus | "none"): DeviceFlowStatus {
  return from === "none" ? "pending" : from;
}

/**
 * Exhaustive device-flow transition.
 * - Issue: none → pending
 * - Approve: pending → approved; approved → approved (idempotent)
 * - Consume: approved → consumed (single-use; delete-on-read in store)
 * - Expire: pending | approved → expired; expired → expired (idempotent)
 */
export function transitionDeviceFlow(
  from: DeviceFlowStatus | "none",
  event: DeviceFlowEvent
): Effect.Effect<DeviceFlowTransition, DeviceFlowIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Issue": {
        if (from === "none") {
          return { status: "pending" as const, alreadyDone: false };
        }
        return yield* new DeviceFlowIllegalTransition({
          from: reportFrom(from),
          event: "Issue",
        });
      }
      case "Approve": {
        if (from === "pending") {
          return { status: "approved" as const, alreadyDone: false };
        }
        if (from === "approved") {
          return { status: "approved" as const, alreadyDone: true };
        }
        return yield* new DeviceFlowIllegalTransition({
          from: reportFrom(from),
          event: "Approve",
        });
      }
      case "Consume": {
        if (from === "approved") {
          return { status: "consumed" as const, alreadyDone: false };
        }
        return yield* new DeviceFlowIllegalTransition({
          from: reportFrom(from),
          event: "Consume",
        });
      }
      case "Expire": {
        if (from === "pending" || from === "approved") {
          return { status: "expired" as const, alreadyDone: false };
        }
        if (from === "expired") {
          return { status: "expired" as const, alreadyDone: true };
        }
        return yield* new DeviceFlowIllegalTransition({
          from: reportFrom(from),
          event: "Expire",
        });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionDeviceFlowSync(
  from: DeviceFlowStatus | "none",
  event: DeviceFlowEvent
): DeviceFlowTransition {
  return Effect.runSync(transitionDeviceFlow(from, event));
}

/** Derive status from a stored pending record (pre-consume). */
export function deviceFlowStatusFromRecord(rec: {
  readonly approvedSubject?: string;
}): DeviceFlowStatus {
  return rec.approvedSubject ? "approved" : "pending";
}
