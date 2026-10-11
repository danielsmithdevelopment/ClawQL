/**
 * Two-party principals for custom-source proposals.
 *
 * Agents propose. Operators approve. The proposing principal cannot approve,
 * and agent principals are never issued the approve capability.
 */

import { userInfo } from "node:os";
import { Effect } from "effect";

export const OPERATOR_PRINCIPAL_ENV = "CLAWQL_OPERATOR_ID";

/** Capability / MCP tool name agents must never hold. */
export const SOURCES_APPROVE_CAPABILITY = "sources_approve";

export type SourceProposalPrincipalKind = "agent" | "operator";

export type SourceProposalPrincipal = {
  readonly kind: SourceProposalPrincipalKind;
  readonly id: string;
};

export function formatSourceProposalPrincipalEffect(
  principal: SourceProposalPrincipal
): Effect.Effect<string, Error> {
  return Effect.try({
    try: () => {
      const id = principal.id.trim();
      if (!id) {
        throw new Error("Source proposal principal id is empty");
      }
      if (principal.kind !== "agent" && principal.kind !== "operator") {
        throw new Error(`Unknown source proposal principal kind: ${String(principal.kind)}`);
      }
      return `${principal.kind}:${id}`;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function parseSourceProposalPrincipalEffect(
  raw: string
): Effect.Effect<SourceProposalPrincipal, Error> {
  return Effect.try({
    try: () => {
      const trimmed = raw.trim();
      const idx = trimmed.indexOf(":");
      if (idx <= 0) {
        throw new Error(`Invalid source proposal principal: ${raw}`);
      }
      const kind = trimmed.slice(0, idx);
      const id = trimmed.slice(idx + 1).trim();
      if ((kind !== "agent" && kind !== "operator") || !id) {
        throw new Error(`Invalid source proposal principal: ${raw}`);
      }
      return { kind, id } as SourceProposalPrincipal;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** MCP / agent session → `agent:<sessionId>`. */
export function agentPrincipalFromSessionIdEffect(
  sessionId?: string
): Effect.Effect<SourceProposalPrincipal> {
  return Effect.sync(() => ({
    kind: "agent" as const,
    id: sessionId?.trim() || "mcp",
  }));
}

/**
 * CLI / console / phone-push operator identity.
 * Prefer `CLAWQL_OPERATOR_ID` (never issued to agent sessions). OS username is
 * the local-CLI fallback — still `kind: operator`, never `agent`.
 */
export function resolveOperatorPrincipalEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<SourceProposalPrincipal, Error> {
  return Effect.try({
    try: () => {
      const fromEnv = env[OPERATOR_PRINCIPAL_ENV]?.trim();
      if (fromEnv) {
        return { kind: "operator" as const, id: fromEnv };
      }
      const username = userInfo().username?.trim();
      if (!username) {
        throw new Error(
          `Cannot resolve operator principal: set ${OPERATOR_PRINCIPAL_ENV} (agents are never issued this identity)`
        );
      }
      return { kind: "operator" as const, id: username };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function assertApproverMayApproveEffect(args: {
  readonly proposedBy: string | null | undefined;
  readonly approvedBy: SourceProposalPrincipal;
}): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    if (args.approvedBy.kind !== "operator") {
      return yield* Effect.fail(
        new Error(
          `${SOURCES_APPROVE_CAPABILITY} is operator-only: agents are never issued this capability`
        )
      );
    }
    const proposedBy = args.proposedBy?.trim() ?? "";
    if (!proposedBy) {
      return yield* Effect.fail(
        new Error("Proposal is missing proposedBy; refusing approval (fail closed)")
      );
    }
    const formatted = yield* formatSourceProposalPrincipalEffect(args.approvedBy);
    if (formatted === proposedBy) {
      return yield* Effect.fail(
        new Error("Proposing principal cannot approve this source (two-party gate)")
      );
    }
  });
}
