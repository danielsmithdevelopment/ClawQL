import { lookup } from "node:dns/promises";
import { Effect } from "effect";
import { isPrivateOrLoopbackIp } from "clawql-api";
import { CallbackEndpointError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

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

/**
 * Validate callback URL: HTTPS required, private/local blocked unless allowLocalhost,
 * DNS-resolved addresses re-checked. Does not fetch.
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

    if (!policy.allowLocalhost) {
      if (BLOCKED_HOSTNAMES.has(host) || isPrivateOrLoopbackIp(host)) {
        return yield* Effect.fail(
          new CallbackEndpointError({
            message: "Callback must not target private or loopback addresses",
            reason: "ssrf_blocked",
          })
        );
      }
      const addrs = yield* Effect.tryPromise({
        try: () => lookup(host, { all: true }),
        catch: () =>
          new CallbackEndpointError({
            message: "Callback host DNS resolution failed",
            reason: "ssrf_blocked",
          }),
      });
      for (const a of addrs) {
        if (isPrivateOrLoopbackIp(a.address)) {
          return yield* Effect.fail(
            new CallbackEndpointError({
              message: "Callback resolves to a private address",
              reason: "ssrf_blocked",
            })
          );
        }
      }
    }

    return parsed;
  });
}
