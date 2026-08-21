import { Data } from "effect";

export class ReauthRequiredError extends Data.TaggedError("ReauthRequiredError")<{
  readonly tokenKey: string;
  readonly providerId: string;
  readonly reason: "no_token" | "invalid_grant" | "refresh_failed";
  readonly reauthUrl?: string;
}> {
  get message(): string {
    return `Provider ${this.providerId} requires re-authorization (${this.reason})`;
  }
}

export class OAuthTokenStoreError extends Data.TaggedError("OAuthTokenStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Extract OAuth error code from fetch/JSON failures. */
export function oauthErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const o = err as { code?: string; error?: string };
  return o.error ?? o.code ?? "unknown";
}
