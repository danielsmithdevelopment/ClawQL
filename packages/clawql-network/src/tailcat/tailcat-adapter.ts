import type { ChildProcess } from "node:child_process";

import { Effect } from "effect";

import { NetworkNotImplementedError } from "../errors.js";

export type TailcatListenerOptions = {
  readonly derpServer?: string;
  readonly allowedPublicKeys?: readonly string[];
};

export type TailcatListenerHandle = {
  readonly address: string;
  readonly process: ChildProcess;
  readonly stop: () => Effect.Effect<void, NetworkNotImplementedError>;
};

export type TailcatConnection = {
  readonly localPublicKey: string;
  readonly remotePublicKey: string;
  readonly derpServer: string | null;
  readonly stop: () => Effect.Effect<void, NetworkNotImplementedError>;
};

/** Spawn tailcat listener subprocess (spec §5.1 — stub). */
export const startTailcatListener = (
  _opts: TailcatListenerOptions = {}
): Effect.Effect<TailcatListenerHandle, NetworkNotImplementedError> =>
  Effect.fail(
    new NetworkNotImplementedError({
      operation: "startTailcatListener",
      message: "Tailcat subprocess adapter not implemented in v0.1 scaffold",
    })
  );

/** Connect to a tailcat address via subprocess client mode (spec §5.1 — stub). */
export const connectViaTailcat = (
  _address: string
): Effect.Effect<TailcatConnection, NetworkNotImplementedError> =>
  Effect.fail(
    new NetworkNotImplementedError({
      operation: "connectViaTailcat",
      message: "Tailcat client connect not implemented in v0.1 scaffold",
    })
  );
