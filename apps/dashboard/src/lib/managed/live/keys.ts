import { createIssuedApiKeyStore } from "clawql-auth";
import { Effect } from "effect";
import { join } from "node:path";

import type { ApiKeyItem } from "@/lib/managed/fixtures";
import { API_KEYS } from "@/lib/managed/fixtures";
import {
  managedOrgId,
  readManagedDataSource,
  resolveWithFallbackEffect,
} from "@/lib/managed/data-source";

function resolveKeysPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAWQL_API_KEYS_PATH?.trim();
  if (override) return override;
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Auth", "api-keys.json");
}

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
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{ readonly keys: ApiKeyItem[]; readonly source: "live" | "fixture" }> =>
  resolveWithFallbackEffect({
    source: readManagedDataSource(env),
    fixture: [...API_KEYS],
    isLiveUseful: (keys) => keys.length > 0,
    live: Effect.gen(function* () {
      const store = createIssuedApiKeyStore({ path: resolveKeysPath(env) });
      const orgId = managedOrgId(env);
      const records = yield* store.listActive(orgId ? { orgId } : undefined);
      return records.map(mapIssuedKeyToUi);
    }),
  }).pipe(Effect.map(({ data, source }) => ({ keys: data, source })));

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
    const store = createIssuedApiKeyStore({ path: resolveKeysPath(env) });
    const result = yield* store
      .issue({
        subjectId: input.subjectId,
        label: input.name,
        orgId: input.orgId ?? managedOrgId(env),
        teamId: input.teamId,
        scope: input.scope?.length ? input.scope : ["execute", "search", "memory"],
        expiresAt: input.expiresAt,
        role: "operator",
      })
      .pipe(
        Effect.mapError((e) => ({
          _tag: "ManagedKeysError" as const,
          reason: e.reason,
        })),
      );
    return {
      key: mapIssuedKeyToUi(result.record),
      secret: result.secret,
      source: "live" as const,
    };
  });

export const revokeManagedKeyEffect = (input: {
  readonly keyId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly ok: true; readonly keyId: string },
  { readonly _tag: "ManagedKeysError"; readonly reason: string }
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const store = createIssuedApiKeyStore({ path: resolveKeysPath(env) });
    const revoked = yield* store.revoke(input.keyId).pipe(
      Effect.mapError((e) => ({
        _tag: "ManagedKeysError" as const,
        reason: e.reason,
      })),
    );
    if (!revoked) {
      return yield* Effect.fail({
        _tag: "ManagedKeysError" as const,
        reason: `Unknown key: ${input.keyId}`,
      });
    }
    return { ok: true as const, keyId: input.keyId };
  });
