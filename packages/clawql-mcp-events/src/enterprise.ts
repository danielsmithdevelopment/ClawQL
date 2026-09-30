import { Effect } from "effect";
import { CallbackEndpointError } from "./errors.js";

export type EnterpriseEventsPolicy = {
  /** Host globs from CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST (comma-separated). Empty = no extra host filter. */
  callbackAllowlist: string[];
  maxSubscriptionsPerPrincipal: number;
  maxDeliveriesPerMinutePerPrincipal: number;
  /** When true, run gateway PII redaction on payloads before delivery. Default true. */
  redactPii: boolean;
  /**
   * Per-subscription minimum ms between stream.changed deliveries.
   * Changes inside the window (or while rate-limited) coalesce into one event.
   * Default: max(1000, ceil(60000 / maxDeliveriesPerMinute)).
   */
  coalesceIntervalMs: number;
};

export function readEnterpriseEventsPolicy(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<EnterpriseEventsPolicy> {
  return Effect.sync(() => {
    const raw = env.CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST?.trim() ?? "";
    const callbackAllowlist = raw
      ? raw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const maxSub = Number.parseInt(
      env.CLAWQL_MCP_EVENTS_MAX_SUBSCRIPTIONS_PER_PRINCIPAL?.trim() ?? "25",
      10
    );
    const maxDel = Number.parseInt(
      env.CLAWQL_MCP_EVENTS_MAX_DELIVERIES_PER_MINUTE_PER_PRINCIPAL?.trim() ?? "60",
      10
    );
    const redactRaw = env.CLAWQL_MCP_EVENTS_REDACT_PII?.trim().toLowerCase();
    const redactPii = !(redactRaw === "0" || redactRaw === "false" || redactRaw === "no");
    const maxDeliveriesPerMinutePerPrincipal =
      Number.isFinite(maxDel) && maxDel > 0 ? maxDel : 60;
    const coalesceRaw = Number.parseInt(
      env.CLAWQL_MCP_EVENTS_COALESCE_INTERVAL_MS?.trim() ?? "",
      10
    );
    const coalesceIntervalMs = Number.isFinite(coalesceRaw) && coalesceRaw >= 0
      ? coalesceRaw
      : Math.max(1000, Math.ceil(60_000 / maxDeliveriesPerMinutePerPrincipal));
    return {
      callbackAllowlist,
      maxSubscriptionsPerPrincipal: Number.isFinite(maxSub) && maxSub > 0 ? maxSub : 25,
      maxDeliveriesPerMinutePerPrincipal,
      redactPii,
      coalesceIntervalMs,
    };
  });
}

/** Match hostname against allowlist entries (`exact` or `*.suffix`). */
export function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const host = hostname.toLowerCase();
  for (const entry of allowlist) {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // ".example.com"
      if (host.endsWith(suffix) || host === entry.slice(2)) return true;
    } else if (host === entry) {
      return true;
    }
  }
  return false;
}

export function assertCallbackAllowlisted(
  url: URL,
  allowlist: string[]
): Effect.Effect<void, CallbackEndpointError> {
  return Effect.gen(function* () {
    if (!hostMatchesAllowlist(url.hostname, allowlist)) {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: `Callback host ${url.hostname} is not on CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST`,
          reason: "allowlist_blocked",
        })
      );
    }
  });
}

/** Sliding-window delivery rate limiter (in-process). */
export class DeliveryRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxPerMinute: number) {}

  /** True when the principal still has capacity this minute (does not consume). */
  wouldAllow(principal: string, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const prev = (this.hits.get(principal) ?? []).filter((t) => t >= windowStart);
    return prev.length < this.maxPerMinute;
  }

  /** Returns false when the principal is over the per-minute delivery cap. */
  tryConsume(principal: string, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const prev = (this.hits.get(principal) ?? []).filter((t) => t >= windowStart);
    if (prev.length >= this.maxPerMinute) {
      this.hits.set(principal, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(principal, prev);
    return true;
  }
}
