/**
 * Agent Client Protocol (ACP) types — NOT payments ACP (`CLAWQL_ACP_*`).
 *
 * Structural subset aligned with https://agentclientprotocol.com/ and Cursor
 * `agent acp` (stdio JSON-RPC, newline-delimited).
 */

export const ACP_PROTOCOL_VERSION = 1 as const;

export type AcpClientInfo = {
  readonly name: string;
  readonly version: string;
};

export type AcpClientCapabilities = {
  readonly fs?: {
    readonly readTextFile?: boolean;
    readonly writeTextFile?: boolean;
  };
  readonly terminal?: boolean;
};

export type AcpTextBlock = {
  readonly type: "text";
  readonly text: string;
};

export type AcpContentBlock =
  AcpTextBlock | { readonly type: string; readonly [k: string]: unknown };

export type AcpMcpServerRef = {
  readonly name: string;
  readonly [k: string]: unknown;
};

export type AcpInitializeResult = {
  readonly protocolVersion: number;
  readonly agentCapabilities?: Record<string, unknown>;
  readonly agentInfo?: { readonly name?: string; readonly version?: string };
  readonly authMethods?: readonly { readonly id?: string; readonly [k: string]: unknown }[];
};

export type AcpNewSessionResult = {
  readonly sessionId: string;
  readonly modes?: unknown;
  readonly configOptions?: unknown;
};

export type AcpPromptResult = {
  readonly stopReason?: string;
  readonly [k: string]: unknown;
};

/** Permission outcome for `session/request_permission` (Cursor option ids). */
export type AcpPermissionOutcome =
  | {
      readonly outcome: "selected";
      readonly optionId: "allow-once" | "allow-always" | "reject-once";
    }
  | { readonly outcome: string; readonly [k: string]: unknown };

export type AcpSessionUpdate = {
  readonly sessionUpdate?: string;
  readonly content?: { readonly text?: string; readonly [k: string]: unknown };
  readonly [k: string]: unknown;
};

export type AcpIncomingNotification = {
  readonly method: string;
  readonly params?: Record<string, unknown>;
};

export type AcpIncomingRequest = {
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
};

export type AcpPermissionHandler = (
  request: AcpIncomingRequest
) => AcpPermissionOutcome | Promise<AcpPermissionOutcome>;

export type AcpUpdateHandler = (update: AcpSessionUpdate, raw: AcpIncomingNotification) => void;

export type AcpExtensionHandler = (
  request: AcpIncomingRequest
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export type AcpClientHandlers = {
  readonly onPermission?: AcpPermissionHandler;
  readonly onUpdate?: AcpUpdateHandler;
  /** Blocking Cursor extensions (`cursor/ask_question`, `cursor/create_plan`, …). */
  readonly onExtensionRequest?: AcpExtensionHandler;
};

export type AcpSpawnConfig = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly clientInfo?: AcpClientInfo;
  readonly clientCapabilities?: AcpClientCapabilities;
  readonly handlers?: AcpClientHandlers;
};
