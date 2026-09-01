import type { WORMAppendInput, WORMEntryType } from "clawql-audit";

/** Subset of Cline SDK hook events mapped to WORM entry types (see personal-agent setup). */
export type ClineHookKind =
  | "file_write_attempt"
  | "file_write_result"
  | "terminal_exec_attempt"
  | "terminal_exec_result"
  | "session_start"
  | "session_end";

export type ClineHookEvent = {
  readonly kind: ClineHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly path?: string;
  readonly command?: string;
  readonly exitCode?: number;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<ClineHookKind, WORMEntryType> = {
  file_write_attempt: "CLINE_FILE_WRITE_ATTEMPT",
  file_write_result: "CLINE_FILE_WRITE_RESULT",
  terminal_exec_attempt: "CLINE_TERMINAL_EXEC_ATTEMPT",
  terminal_exec_result: "CLINE_TERMINAL_EXEC_RESULT",
  session_start: "CLINE_SESSION_START",
  session_end: "CLINE_SESSION_END",
};

export const clineHookToWormAppend = (
  event: ClineHookEvent,
  agentName = "cline"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    path: event.path,
    command: event.command,
    exitCode: event.exitCode,
    success: event.success,
    ...event.metadata,
  },
});

/** MCP server block for Cline settings — ClawQL tools only; host file/terminal need hooks. */
export const clineMcpServerConfig = (mcpEndpoint: string) => ({
  name: "clawql",
  url: mcpEndpoint,
  transport: "streamable-http" as const,
});
