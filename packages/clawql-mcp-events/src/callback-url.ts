import { Effect } from "effect";
import { assertSafeSourceFetchUrlResolvedEffect } from "clawql-core";
import { CallbackEndpointError } from "./errors.js";

export type CallbackUrlPolicy = {
  /** When true, allow loopback / private hosts (local tests only). */
  allowLocalhost: boolean;
};

export function readCallbackUrlPolicy(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CallbackUrlPolicy> {
  return Effect.sync(() => ({
    allowLocalhost: ["1", "true", "yes"].includes(
      (env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST ?? "").trim().toLowerCase()
    ),
  }));
}

function toCallbackSsrfError(cause: unknown): CallbackEndpointError {
  const message = cause instanceof Error ? cause.message : String(cause);
  let mapped = "Callback host is not allowed";
  if (/Invalid source URL/i.test(message)) {
    mapped = "Invalid callback URL";
  } else if (/must use HTTPS/i.test(message)) {
    mapped = "Callback URL must use HTTPS";
  } else if (/resolve to private or loopback/i.test(message)) {
    mapped = "Callback resolves to a private address";
  } else if (/private or loopback/i.test(message)) {
    mapped = "Callback must not target private or loopback addresses";
  } else if (/ENOTFOUND|getaddrinfo|EAI_AGAIN|DNS|resolution failed/i.test(message)) {
    mapped = "Callback host DNS resolution failed";
  } else if (/not allowed/i.test(message)) {
    mapped = "Callback host is not allowed";
  }
  return new CallbackEndpointError({
    message: mapped,
    reason: "ssrf_blocked",
  });
}

/**
 * Validate callback URL: HTTPS required (HTTP only when allowLocalhost),
 * private/local blocked unless allowLocalhost, DNS-resolved addresses
 * re-checked via clawql-core egress. Does not fetch.
 */
export function assertSafeCallbackUrl(
  raw: string,
  policy: CallbackUrlPolicy
): Effect.Effect<URL, CallbackEndpointError> {
  return Effect.gen(function* () {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: "Invalid callback URL",
          reason: "ssrf_blocked",
        })
      );
    }

    // Domain policy: callbacks are HTTPS-only unless local-test allow is on.
    // Do not honor CLAWQL_SOURCES_ALLOW_HTTP here.
    if (parsed.protocol !== "https:" && !(policy.allowLocalhost && parsed.protocol === "http:")) {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: "Callback URL must use HTTPS",
          reason: "ssrf_blocked",
        })
      );
    }

    const host = parsed.hostname.toLowerCase();
    if (!host || host.endsWith(".localhost")) {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: "Callback host is not allowed",
          reason: "ssrf_blocked",
        })
      );
    }

    if (policy.allowLocalhost) {
      return parsed;
    }

    return yield* assertSafeSourceFetchUrlResolvedEffect(raw).pipe(
      Effect.mapError(toCallbackSsrfError)
    );
  });
}
