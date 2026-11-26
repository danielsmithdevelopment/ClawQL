import { createIssuedApiKeyStore } from "clawql-auth";
import { Effect } from "effect";

import type { ApiKeyItem } from "@/lib/managed/fixtures";
import { API_KEYS } from "@/lib/managed/fixtures";
import {
  managedOrgId,
  readManagedDataSource,
  resolveWithFallbackEffect,
} from "@/lib/managed/data-source";
import { resolveManagedStorePathEffect } from "@/lib/managed/org-home";

const resolveKeysPathEffect = (input: {
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<string, Error> =>
  resolveManagedStorePathEffect({
    orgId: input.orgId,
    segments: ["Auth", "api-keys.json"],
    overrideEnvKey: "CLAWQL_API_KEYS_PATH",
    env: input.env,
  }).pipe(
    Effect.mapError(
      (e) => new Error(e.detail ?? e.reason),
    ),
  );

function formatExpiry(expiresAt: string | undefined): string {
  if (!expiresAt) return "No expiry";
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return expiresAt;
  return `Expires ${d.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
}

function scopeLabel(scope: readonly string[]): string {
  if (scope.length === 0) return "Nothing selected";
  const labels = scope.map((s) => {
    if (s === "execute" || s === "search") return "Tools";
    if (s === "memory") return "Memory";
    if (s === "inference" || s === "models") return "Models";
    return s;
  });
  return [...new Set(labels)].join(", ");
}

export function mapIssuedKeyToUi(record: {
  readonly id: string;
  readonly label?: string;
  readonly teamId?: string;
  readonly scope: readonly string[];
  readonly expiresAt?: string;
}): ApiKeyItem {
  return {
    id: record.id,
    name: record.label?.trim() || record.id,
    expiresLabel: formatExpiry(record.expiresAt),
    keyGroup: record.teamId?.trim() || "Default",
    canUse: scopeLabel(record.scope),
    dailyCap: "—",
  };
}

export const listManagedKeysEffect = (
  input: {
    /** Session org — required for live listing (BB1); never fall back to env-only listing of all orgs. */
    readonly orgId: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): Effect.Effect<{ readonly keys: ApiKeyItem[]; readonly source: "live" | "fixture" }> => {
  const env = input.env ?? process.env;
  const orgId = input.orgId.trim();
  return resolveWithFallbackEffect({
    source: readManagedDataSource(env),
    fixture: [...API_KEYS],
    empty: [],
    env,
    isLiveUseful: (keys) => keys.length > 0,
    live: Effect.gen(function* () {
      if (!orgId) {
        return [];
      }
      const path = yield* resolveKeysPathEffect({ orgId, env }).pipe(Effect.orDie);
      const store = createIssuedApiKeyStore({ path });
      const records = yield* store.listActive({ orgId });
      return records.map(mapIssuedKeyToUi);
    }),
  }).pipe(Effect.map(({ data, source }) => ({ keys: data, source })));
};

export const issueManagedKeyEffect = (input: {
  readonly name: string;
  readonly subjectId: string;
  readonly orgId?: string;
  readonly teamId?: string;
  readonly scope?: string[];
  readonly expiresAt?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly key: ApiKeyItem; readonly secret: string; readonly source: "live" },
  { readonly _tag: "ManagedKeysError"; readonly reason: string }
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: "Key issue disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture",
      });
    }
    const orgId = (input.orgId ?? managedOrgId(env) ?? "").trim();
    const path = yield* resolveKeysPathEffect({ orgId, env }).pipe(
      Effect.mapError((e) => ({
        _tag: "ManagedKeysError" as const,
        reason: e.message,
      })),
    );
    const store = createIssuedApiKeyStore({ path });
    const result = yield* store
      .issue({
        subjectId: input.subjectId,
        label: input.name,
        orgId: orgId || undefined,
        teamId: input.teamId,
        scope: input.scope?.length ? input.scope : ["execute", "search", "memory"],
        expiresAt: input.expiresAt,
        role: "operator",
      })
      .pipe(
        Effect.mapError((e) => ({
          _tag: "ManagedKeysError" as const,
          reason: e.reason,
        }))
      );
    return {
      key: mapIssuedKeyToUi(result.record),
      secret: result.secret,
      source: "live" as const,
    };
  });

export const revokeManagedKeyEffect = (input: {
  readonly keyId: string;
  /** Trusted org from session/env — required so revoke cannot cross tenants (IDOR). */
  readonly orgId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly ok: true; readonly keyId: string },
  { readonly _tag: "ManagedKeysError"; readonly reason: string }
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const trusted = input.orgId.trim();
    const path = yield* resolveKeysPathEffect({ orgId: trusted, env }).pipe(
      Effect.mapError((e) => ({
        _tag: "ManagedKeysError" as const,
        reason: e.message,
      })),
    );
    const store = createIssuedApiKeyStore({ path });
    const existing = yield* store.findById(input.keyId);
    if (!existing || existing.revokedAt) {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: `Unknown key: ${input.keyId}`,
      });
    }
    if (existing.orgId && existing.orgId !== trusted) {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: "org_mismatch",
      });
    }
    if (!existing.orgId && managedOrgId(env) && managedOrgId(env) !== trusted) {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: "org_mismatch",
      });
    }
    const revoked = yield* store.revoke(input.keyId).pipe(
      Effect.mapError((e) => ({
        _tag: "ManagedKeysError" as const,
        reason: e.reason,
      }))
    );
    if (!revoked) {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: `Unknown key: ${input.keyId}`,
      });
    }
    return { ok: true as const, keyId: input.keyId };
  });
