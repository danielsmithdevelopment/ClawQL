/**
 * Outbound API key / PAT retrieval via injectable secret source (Vault path, env, etc.).
 * Secrets are not cached beyond the call.
 *
 * Effect-primary: {@link OutboundAPIKeyManagerService} + {@link createOutboundAPIKeyManagerLayer}
 * mirror {@link GatewayAuthService} / {@link IdJagIssuerService}.
 */

import { Context, Data, Effect, Layer } from "effect";

import {
  emitAuthEvent,
  noopAuthEventSink,
  type AuthEvent,
  type AuthEventSink,
} from "../audit/auth-events.js";

export class OutboundApiKeyError extends Data.TaggedError("OutboundApiKeyError")<{
  readonly reason: string;
  readonly providerId?: string;
}> {}

/** Host-injected secret lookup (Vault path, env, etc). Effect-primary. */
export type SecretSource = {
  getSecret: (path: string) => Effect.Effect<string | null, unknown>;
};

export type OutboundAPIKeyManagerOptions = {
  secrets: SecretSource;
  eventSink?: AuthEventSink;
  /** Default path template; `{providerId}` substituted. */
  pathTemplate?: string;
  now?: () => Date;
};

/**
 * `auth-events.ts` still exposes a Promise-based `emitAuthEvent` — wrap with `Effect.tryPromise`
 * here. TODO(effect-ts-everywhere): switch to an `emitAuthEventEffect` once `audit/auth-events.ts`
 * grows one; re-check that file before assuming this wrapper is still needed.
 */
function emitEffect(sink: AuthEventSink, event: AuthEvent): Effect.Effect<void> {
  return Effect.tryPromise({
    try: () => Promise.resolve(emitAuthEvent(sink, event)),
    catch: () => undefined,
  }).pipe(Effect.catchAll(() => Effect.void));
}

export class OutboundAPIKeyManager {
  private readonly eventSink: AuthEventSink;
  private readonly pathTemplate: string;
  private readonly now: () => Date;

  constructor(private readonly options: OutboundAPIKeyManagerOptions) {
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.pathTemplate = options.pathTemplate ?? "vault://clawql/providers/{providerId}/api-key";
    this.now = options.now ?? (() => new Date());
  }

  getKey(
    providerId: string,
    sessionId: string
  ): Effect.Effect<string, OutboundApiKeyError | unknown> {
    return Effect.gen(this, function* () {
      const path = this.pathTemplate.replaceAll("{providerId}", providerId);
      const key = yield* this.options.secrets.getSecret(path);
      if (!key) {
        yield* emitEffect(this.eventSink, {
          type: "API_KEY_INVALID",
          reason: "not_found",
          timestamp: this.now().toISOString(),
        });
        return yield* Effect.fail(
          new OutboundApiKeyError({
            reason: `No API key configured for provider: ${providerId}`,
            providerId,
          })
        );
      }

      yield* emitEffect(this.eventSink, {
        type: "API_KEY_USED",
        keyId: providerId,
        subjectId: sessionId,
        timestamp: this.now().toISOString(),
      });

      return key;
    });
  }
}

export function createOutboundAPIKeyManager(
  options: OutboundAPIKeyManagerOptions
): OutboundAPIKeyManager {
  return new OutboundAPIKeyManager(options);
}

export class OutboundAPIKeyManagerService extends Context.Tag(
  "clawql/OutboundAPIKeyManagerService"
)<
  OutboundAPIKeyManagerService,
  {
    readonly getKey: (
      providerId: string,
      sessionId: string
    ) => Effect.Effect<string, OutboundApiKeyError | unknown>;
  }
>() {}

export function outboundAPIKeyManagerServiceFromManager(
  manager: OutboundAPIKeyManager
): OutboundAPIKeyManagerService["Type"] {
  return OutboundAPIKeyManagerService.of({
    getKey: (providerId, sessionId) => manager.getKey(providerId, sessionId),
  });
}

/** Build an isolated outbound API key manager service layer. */
export function createOutboundAPIKeyManagerLayer(
  options: OutboundAPIKeyManagerOptions
): Layer.Layer<OutboundAPIKeyManagerService> {
  return Layer.succeed(
    OutboundAPIKeyManagerService,
    outboundAPIKeyManagerServiceFromManager(createOutboundAPIKeyManager(options))
  );
}

/** Map-backed secret source for tests. */
export function createMemorySecretSource(
  initial?: Record<string, string>
): SecretSource & { readonly map: Map<string, string> } {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    map,
    getSecret: (path) => Effect.sync(() => map.get(path) ?? null),
  };
}
