/**
 * Outbound API key / PAT retrieval via injectable secret source (Vault path, env, etc.).
 * Secrets are not cached beyond the call.
 */

import { Data } from "effect";

import {
  emitAuthEvent,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";

export class OutboundApiKeyError extends Data.TaggedError("OutboundApiKeyError")<{
  readonly reason: string;
  readonly providerId?: string;
}> {}

export type SecretSource = {
  getSecret: (path: string) => Promise<string | null>;
};

export type OutboundAPIKeyManagerOptions = {
  secrets: SecretSource;
  eventSink?: AuthEventSink;
  /** Default path template; `{providerId}` substituted. */
  pathTemplate?: string;
  now?: () => Date;
};

export class OutboundAPIKeyManager {
  private readonly eventSink: AuthEventSink;
  private readonly pathTemplate: string;
  private readonly now: () => Date;

  constructor(private readonly options: OutboundAPIKeyManagerOptions) {
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.pathTemplate =
      options.pathTemplate ?? "vault://clawql/providers/{providerId}/api-key";
    this.now = options.now ?? (() => new Date());
  }

  async getKey(providerId: string, sessionId: string): Promise<string> {
    const path = this.pathTemplate.replaceAll("{providerId}", providerId);
    const key = await this.options.secrets.getSecret(path);
    if (!key) {
      await emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "not_found",
        timestamp: this.now().toISOString(),
      });
      throw new OutboundApiKeyError({
        reason: `No API key configured for provider: ${providerId}`,
        providerId,
      });
    }

    await emitAuthEvent(this.eventSink, {
      type: "API_KEY_USED",
      keyId: providerId,
      subjectId: sessionId,
      timestamp: this.now().toISOString(),
    });

    return key;
  }
}

export function createOutboundAPIKeyManager(
  options: OutboundAPIKeyManagerOptions
): OutboundAPIKeyManager {
  return new OutboundAPIKeyManager(options);
}

/** Map-backed secret source for tests. */
export function createMemorySecretSource(
  initial?: Record<string, string>
): SecretSource & { readonly map: Map<string, string> } {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    map,
    async getSecret(path) {
      return map.get(path) ?? null;
    },
  };
}
