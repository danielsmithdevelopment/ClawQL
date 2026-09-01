/**
 * MCP OAuth bootstrap parse failures (EMA orgs / clients JSON).
 * Raised when `CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT=1` (fail-closed).
 */

import { Data } from "effect";

export class McpOAuthBootstrapError extends Data.TaggedError("McpOAuthBootstrapError")<{
  readonly source: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    const detail =
      this.cause instanceof Error
        ? this.cause.message
        : this.cause != null
          ? String(this.cause)
          : "invalid bootstrap";
    return `${this.source}: ${detail}`;
  }
}

export function isMcpOAuthBootstrapStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "fail-closed" || v === "fail_closed";
}
