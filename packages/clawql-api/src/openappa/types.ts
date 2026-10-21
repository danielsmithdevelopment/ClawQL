/**
 * OpenAPPA PROTOCOL=1 wire types (snake_case on the wire).
 * @see https://github.com/archestra-ai/OpenAPPA
 */

export const OPENAPPA_PROTOCOL = 1 as const;

export type OpenAppaAdapter = "opencode" | "claude-code" | "kagent";

export type OpenAppaEventName =
  "session_start" | "tool_call" | "tool_result" | "spawn_result" | "child_end";

/** Decisions observed / handled by the ClawQL client. */
export type OpenAppaDecisionName =
  | "ack"
  | "allow_call"
  | "pass_control"
  | "deny_call"
  | "block"
  | "replace_output"
  | "deliver_value"
  | "child_return"
  | "context"
  | "refuse";

export type OpenAppaOffer = {
  readonly offer_id: string;
  readonly input_sanitizer?: string;
  readonly returns?: unknown;
};

export type OpenAppaWireDecision = {
  readonly protocol: typeof OPENAPPA_PROTOCOL;
  readonly decision: OpenAppaDecisionName;
  readonly feedback?: string;
  readonly reason?: string;
  readonly detail?: string;
  readonly class?: string;
  readonly offers?: readonly OpenAppaOffer[];
  readonly review?: readonly unknown[];
  readonly value?: string;
  readonly output?: string;
  readonly text?: string;
};

export type OpenAppaToolOutcome =
  | { readonly status: "success"; readonly body: unknown }
  | { readonly status: "failure"; readonly message: string }
  | { readonly status: "indeterminate" };

export type OpenAppaHookRequest = {
  readonly protocol: typeof OPENAPPA_PROTOCOL;
  readonly adapter: OpenAppaAdapter;
  readonly event: OpenAppaEventName;
  readonly root_id: string;
  readonly child_id?: string;
  readonly tool?: string;
  readonly arguments?: unknown;
  readonly call_id?: string;
  readonly outcome?: OpenAppaToolOutcome;
};

export type OpenAppaGateVerdict =
  | { readonly allow: true; readonly decision: OpenAppaWireDecision }
  | {
      readonly allow: false;
      readonly status: "blocked" | "mandate_required";
      readonly reason: string;
      readonly decision: OpenAppaWireDecision;
      readonly offerIds?: readonly string[];
    };
