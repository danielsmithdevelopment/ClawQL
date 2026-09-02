import { Context, Effect, Layer } from "effect";
import {
  canonicalJson,
  hashCanonicalPayload,
  isHashChained,
  sealHashChainRecord,
  sha256Hex,
  verifyHashChain,
  type HashChainLink,
  type HashChainVerifyResult,
} from "../hash-chain.js";

export class HashChainService extends Context.Tag("clawql/HashChainService")<
  HashChainService,
  {
    readonly canonicalJson: (value: unknown) => Effect.Effect<string>;
    readonly sha256Hex: (value: string) => Effect.Effect<string>;
    readonly hashCanonicalPayload: (payload: unknown) => Effect.Effect<string>;
    readonly sealRecord: (
      payload: Record<string, unknown>,
      seq: number,
      prevHash: string
    ) => Effect.Effect<Record<string, unknown> & HashChainLink>;
    readonly verify: (links: readonly HashChainLink[]) => Effect.Effect<HashChainVerifyResult>;
    readonly isHashChained: (value: unknown) => Effect.Effect<boolean>;
  }
>() {}

export const HashChainServiceLive = Layer.succeed(
  HashChainService,
  HashChainService.of({
    canonicalJson: (value) => Effect.sync(() => canonicalJson(value)),
    sha256Hex: (value) => Effect.sync(() => sha256Hex(value)),
    hashCanonicalPayload: (payload) => Effect.sync(() => hashCanonicalPayload(payload)),
    sealRecord: (payload, seq, prevHash) =>
      Effect.sync(() => sealHashChainRecord(payload, seq, prevHash)),
    verify: (links) =>
      Effect.sync(() => verifyHashChain(links as Parameters<typeof verifyHashChain>[0])),
    isHashChained: (value) =>
      Effect.sync(() => isHashChained(value as Parameters<typeof isHashChained>[0])),
  })
);

export function runHashChainEffect<A, E>(
  program: Effect.Effect<A, E, HashChainService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(HashChainServiceLive)));
}
