/**
 * Line-oriented JSON-RPC 2.0 transport for Agent Client Protocol (stdio NDJSON).
 */
import { Deferred, Effect, Ref } from "effect";
import type { Readable, Writable } from "node:stream";
import { AcpError } from "./errors.js";

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
};

export type JsonRpcNotification = {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
};

export type JsonRpcSuccess = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result: unknown;
};

export type JsonRpcFailure = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcSuccess | JsonRpcFailure;

export type AcpTransport = {
  readonly write: (message: JsonRpcMessage) => Effect.Effect<void, AcpError>;
  readonly close: () => Effect.Effect<void>;
};

export type AcpRpcState = {
  nextId: number;
  pending: Map<JsonRpcId, Deferred.Deferred<unknown, AcpError>>;
  closed: boolean;
};

export const makeAcpRpcState = (): Effect.Effect<Ref.Ref<AcpRpcState>> =>
  Ref.make<AcpRpcState>({
    nextId: 1,
    pending: new Map<JsonRpcId, Deferred.Deferred<unknown, AcpError>>(),
    closed: false,
  });

export const writeNdjsonLine = (
  sink: Writable,
  message: JsonRpcMessage
): Effect.Effect<void, AcpError> =>
  Effect.try({
    try: () => {
      sink.write(`${JSON.stringify(message)}\n`);
    },
    catch: (e) => new AcpError({ reason: e instanceof Error ? e.message : String(e) }),
  });

export const parseNdjsonLine = (line: string): Effect.Effect<JsonRpcMessage, AcpError> =>
  Effect.try({
    try: () => JSON.parse(line) as JsonRpcMessage,
    catch: (e) =>
      new AcpError({
        reason: `invalid ACP JSON: ${e instanceof Error ? e.message : String(e)}`,
      }),
  });

/**
 * Attach a Readable line reader that completes Deferred waiters and forwards
 * requests/notifications to `onMessage`.
 */
export const attachAcpReader = (
  source: Readable,
  stateRef: Ref.Ref<AcpRpcState>,
  onMessage: (msg: JsonRpcMessage) => void
): Effect.Effect<{ readonly stop: () => void }, never> =>
  Effect.sync(() => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line) as JsonRpcMessage;
        } catch {
          continue;
        }
        const id = "id" in msg ? msg.id : undefined;
        const isResponse =
          id !== undefined && (("result" in msg && msg.result !== undefined) || "error" in msg);
        if (isResponse && id !== undefined) {
          void Effect.runPromise(
            Effect.gen(function* () {
              const waiter = yield* Ref.modify(stateRef, (s) => {
                const deferred = s.pending.get(id);
                const pending = new Map(s.pending);
                pending.delete(id);
                return [deferred, { ...s, pending }] as const;
              });
              if (!waiter) return;
              if ("error" in msg && msg.error) {
                yield* Deferred.fail(
                  waiter,
                  new AcpError({
                    reason: msg.error.message,
                    code: msg.error.code,
                    data: msg.error.data,
                  })
                );
              } else if ("result" in msg) {
                yield* Deferred.succeed(waiter, msg.result);
              }
            })
          );
          continue;
        }
        onMessage(msg);
      }
    };
    source.on("data", onData);
    return {
      stop: () => {
        source.off("data", onData);
      },
    };
  });

export const requestOverTransport = (
  transport: AcpTransport,
  stateRef: Ref.Ref<AcpRpcState>,
  method: string,
  params?: unknown
): Effect.Effect<unknown, AcpError> =>
  Effect.gen(function* () {
    const state = yield* Ref.get(stateRef);
    if (state.closed) {
      return yield* Effect.fail(new AcpError({ reason: "ACP transport closed" }));
    }
    const deferred = yield* Deferred.make<unknown, AcpError>();
    const id = yield* Ref.modify(stateRef, (s) => {
      const next = s.nextId;
      const pending = new Map(s.pending);
      pending.set(next, deferred);
      return [next, { ...s, nextId: next + 1, pending }] as const;
    });
    yield* transport.write({ jsonrpc: "2.0", id, method, params });
    return yield* Deferred.await(deferred);
  });

export const notifyOverTransport = (
  transport: AcpTransport,
  method: string,
  params?: unknown
): Effect.Effect<void, AcpError> => transport.write({ jsonrpc: "2.0", method, params });

export const respondOverTransport = (
  transport: AcpTransport,
  id: JsonRpcId,
  result: unknown
): Effect.Effect<void, AcpError> => transport.write({ jsonrpc: "2.0", id, result });
