/**
 * Effect Agent Client Protocol client (stdio JSON-RPC).
 *
 * Prefer this over new native clawql-agents adapters when the coding agent
 * speaks ACP (ADR 0017). Not payments ACP.
 */
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { Context, Deferred, Effect, Layer, Ref } from "effect";
import { AcpError } from "./errors.js";
import {
  attachAcpReader,
  makeAcpRpcState,
  notifyOverTransport,
  requestOverTransport,
  respondOverTransport,
  writeNdjsonLine,
  type AcpTransport,
  type JsonRpcMessage,
} from "./transport.js";
import {
  ACP_PROTOCOL_VERSION,
  type AcpClientHandlers,
  type AcpClientInfo,
  type AcpInitializeResult,
  type AcpNewSessionResult,
  type AcpPermissionOutcome,
  type AcpPromptResult,
  type AcpSpawnConfig,
  type AcpContentBlock,
  type AcpMcpServerRef,
  type AcpSessionUpdate,
} from "./types.js";

export type AgentClientProtocolApi = {
  readonly initialize: () => Effect.Effect<AcpInitializeResult, AcpError>;
  readonly authenticate: (methodId: string) => Effect.Effect<unknown, AcpError>;
  readonly newSession: (input: {
    readonly cwd: string;
    readonly mcpServers?: readonly AcpMcpServerRef[];
    readonly additionalDirectories?: readonly string[];
  }) => Effect.Effect<AcpNewSessionResult, AcpError>;
  readonly prompt: (input: {
    readonly sessionId: string;
    readonly prompt: readonly AcpContentBlock[];
  }) => Effect.Effect<AcpPromptResult, AcpError>;
  readonly cancel: (sessionId: string) => Effect.Effect<void, AcpError>;
  readonly close: () => Effect.Effect<void>;
};

export class AgentClientProtocol extends Context.Service<
  AgentClientProtocol,
  AgentClientProtocolApi
>()("clawql/AgentClientProtocol") {}

const defaultPermission: AcpPermissionOutcome = {
  outcome: "selected",
  optionId: "allow-once",
};

const handleIncoming = (
  transport: AcpTransport,
  handlers: AcpClientHandlers | undefined,
  msg: JsonRpcMessage
): void => {
  if (!("method" in msg) || !msg.method) return;
  const method = msg.method;
  const hasId = "id" in msg && msg.id !== undefined;

  if (method === "session/update") {
    const params = (msg.params ?? {}) as { update?: AcpSessionUpdate };
    handlers?.onUpdate?.(params.update ?? (msg.params as AcpSessionUpdate), {
      method,
      params: msg.params as Record<string, unknown> | undefined,
    });
    return;
  }

  if (!hasId) return;
  const id = msg.id as string | number;

  if (method === "session/request_permission") {
    void Promise.resolve(
      handlers?.onPermission?.({
        id,
        method,
        params: msg.params as Record<string, unknown> | undefined,
      }) ?? defaultPermission
    ).then((outcome) =>
      Effect.runPromise(respondOverTransport(transport, id, { outcome }))
    );
    return;
  }

  if (method.startsWith("cursor/")) {
    void Promise.resolve(
      handlers?.onExtensionRequest?.({
        id,
        method,
        params: msg.params as Record<string, unknown> | undefined,
      }) ?? { outcome: { outcome: "cancelled" } }
    ).then((result) => Effect.runPromise(respondOverTransport(transport, id, result)));
  }
};

const makeApi = (
  transport: AcpTransport,
  stateRef: Ref.Ref<import("./transport.js").AcpRpcState>,
  clientInfo: AcpClientInfo,
  clientCapabilities: AcpSpawnConfig["clientCapabilities"],
  onClose: () => Effect.Effect<void>
): AgentClientProtocolApi => ({
  initialize: () =>
    requestOverTransport(transport, stateRef, "initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: clientCapabilities ?? {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo,
    }).pipe(Effect.map((r) => r as AcpInitializeResult)),

  authenticate: (methodId) =>
    requestOverTransport(transport, stateRef, "authenticate", { methodId }),

  newSession: (input) =>
    requestOverTransport(transport, stateRef, "session/new", {
      cwd: input.cwd,
      mcpServers: input.mcpServers ?? [],
      ...(input.additionalDirectories
        ? { additionalDirectories: input.additionalDirectories }
        : {}),
    }).pipe(Effect.map((r) => r as AcpNewSessionResult)),

  prompt: (input) =>
    requestOverTransport(transport, stateRef, "session/prompt", {
      sessionId: input.sessionId,
      prompt: input.prompt,
    }).pipe(Effect.map((r) => r as AcpPromptResult)),

  cancel: (sessionId) =>
    notifyOverTransport(transport, "session/cancel", { sessionId }),

  close: () =>
    Effect.gen(function* () {
      const pending = yield* Ref.modify(stateRef, (s) => {
        const waiters = [...s.pending.values()];
        return [waiters, { ...s, closed: true, pending: new Map() }] as const;
      });
      for (const waiter of pending) {
        yield* Deferred.fail(waiter, new AcpError({ reason: "ACP client closed" }));
      }
      yield* onClose();
      yield* transport.close();
    }),
});

export type AcpDuplexConfig = {
  readonly readable: import("node:stream").Readable;
  readonly writable: import("node:stream").Writable;
  readonly clientInfo?: AcpClientInfo;
  readonly clientCapabilities?: AcpSpawnConfig["clientCapabilities"];
  readonly handlers?: AcpClientHandlers;
  readonly onClose?: () => Effect.Effect<void>;
};

/** Layer over an existing duplex (tests / custom spawn). */
export const makeAgentClientProtocolDuplexLayer = (
  config: AcpDuplexConfig
): Layer.Layer<AgentClientProtocol> =>
  Layer.effect(
    AgentClientProtocol,
    Effect.gen(function* () {
      const stateRef = yield* makeAcpRpcState();
      const transport: AcpTransport = {
        write: (message) => writeNdjsonLine(config.writable, message),
        close: () => Effect.void,
      };
      const reader = yield* attachAcpReader(config.readable, stateRef, (msg) =>
        handleIncoming(transport, config.handlers, msg)
      );
      const clientInfo = config.clientInfo ?? {
        name: "clawql-agent-client-protocol",
        version: "0.1.0",
      };
      return AgentClientProtocol.of(
        makeApi(transport, stateRef, clientInfo, config.clientCapabilities, () =>
          Effect.sync(() => {
            reader.stop();
          }).pipe(Effect.andThen(config.onClose?.() ?? Effect.void))
        )
      );
    })
  );

/** Spawn `command args` (default: `agent acp`) and speak ACP over stdio. */
export const makeAgentClientProtocolLayer = (
  config: AcpSpawnConfig
): Layer.Layer<AgentClientProtocol> =>
  Layer.effect(
    AgentClientProtocol,
    Effect.sync(() => {
      const child = spawn(config.command, [...(config.args ?? ["acp"])], {
        cwd: config.cwd,
        env: config.env ?? process.env,
        stdio: ["pipe", "pipe", "inherit"],
      });
      const stdin = child.stdin;
      const stdout = child.stdout;
      if (!stdin || !stdout) {
        throw new Error("ACP child missing stdio pipes");
      }

      // Sync Ref + reader bootstrap (forced host spawn boundary).
      const stateRef = Effect.runSync(makeAcpRpcState());
      const transport: AcpTransport = {
        write: (message) => writeNdjsonLine(stdin, message),
        close: () =>
          Effect.sync(() => {
            try {
              stdin.end();
            } catch {
              /* ignore */
            }
          }),
      };
      const reader = Effect.runSync(
        attachAcpReader(stdout, stateRef, (msg) =>
          handleIncoming(transport, config.handlers, msg)
        )
      );
      const clientInfo = config.clientInfo ?? {
        name: "clawql-agent-client-protocol",
        version: "0.1.0",
      };
      return AgentClientProtocol.of(
        makeApi(transport, stateRef, clientInfo, config.clientCapabilities, () =>
          Effect.sync(() => {
            reader.stop();
            try {
              child.kill();
            } catch {
              /* ignore */
            }
          })
        )
      );
    })
  );

/**
 * In-memory agent stub for unit tests: echoes prompts and answers permissions.
 * Pair with {@link makeAgentClientProtocolDuplexLayer} via {@link makeAcpTestPair}.
 */
export const makeAcpTestPair = (
  handlers?: AcpClientHandlers
): {
  readonly clientLayer: Layer.Layer<AgentClientProtocol>;
  readonly agentInbox: PassThrough;
  readonly agentOut: PassThrough;
  /** Drive a minimal fake agent that answers initialize / session / prompt. */
  readonly runFakeAgent: () => void;
} => {
  const toClient = new PassThrough();
  const toAgent = new PassThrough();
  const clientLayer = makeAgentClientProtocolDuplexLayer({
    readable: toClient,
    writable: toAgent,
    handlers,
  });

  const runFakeAgent = () => {
    let buf = "";
    toAgent.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as JsonRpcMessage;
        if (!("method" in msg) || !("id" in msg) || msg.id === undefined) continue;
        const id = msg.id;
        if (msg.method === "initialize") {
          toClient.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id,
              result: {
                protocolVersion: ACP_PROTOCOL_VERSION,
                agentInfo: { name: "fake-acp-agent", version: "0.0.0" },
                authMethods: [{ id: "cursor_login" }],
              },
            })}\n`
          );
        } else if (msg.method === "authenticate") {
          toClient.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: {} })}\n`);
        } else if (msg.method === "session/new") {
          toClient.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id,
              result: { sessionId: "sess_test_1" },
            })}\n`
          );
        } else if (msg.method === "session/prompt") {
          toClient.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: "hello from fake agent" },
                },
              },
            })}\n`
          );
          toClient.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id,
              result: { stopReason: "end_turn" },
            })}\n`
          );
        }
      }
    });
  };

  return { clientLayer, agentInbox: toAgent, agentOut: toClient, runFakeAgent };
};
