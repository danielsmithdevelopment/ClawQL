/**
 * Structured capability / config errors for MCP tools and callers.
 * Prefer these over generic Error so agents get a stable `code` + `reason`.
 */

export type WebCapabilityErrorCode =
  | "NO_BROWSER_PROVIDER"
  | "NO_SEARCH_PROVIDER"
  | "CAPABILITY_UNSUPPORTED"
  | "PROVIDER_MISCONFIGURED";

export class WebCapabilityError extends Error {
  readonly code: WebCapabilityErrorCode;
  readonly reason: string;
  readonly provider?: string;
  readonly capability?: string;

  constructor(input: {
    code: WebCapabilityErrorCode;
    reason: string;
    provider?: string;
    capability?: string;
  }) {
    super(input.reason);
    this.name = "WebCapabilityError";
    this.code = input.code;
    this.reason = input.reason;
    this.provider = input.provider;
    this.capability = input.capability;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        reason: this.reason,
        provider: this.provider,
        capability: this.capability,
      },
    };
  }
}

export function isWebCapabilityError(err: unknown): err is WebCapabilityError {
  return err instanceof WebCapabilityError;
}
