/**
 * MCP OAuth §2 — grant-as-key store.
 *
 * One live grant per (subject, clientId, resource). The grant's `virtualKeyId` is
 * stamped on access tokens; it is never the OAuth `clientId`.
 */

import { randomBytes } from "node:crypto";
import { Effect } from "effect";
import type { McpGrantKeyRecord, McpGrantKeyStore, McpGrantType } from "./mcp-oauth.js";

export type McpGrantKeyCreateInput = Omit<
  McpGrantKeyRecord,
  "virtualKeyId" | "createdAtMs" | "revokedAtMs"
>;

function compositeKey(subject: string, clientId: string, resource: string | undefined): string {
  return `${subject}\u0000${clientId}\u0000${resource ?? ""}`;
}

function newVirtualKeyId(): string {
  return `mgr_${randomBytes(12).toString("hex")}`;
}

/** In-process grant store — tests and single-node AS. */
export function createMemoryMcpGrantKeyStore(now: () => number = Date.now): McpGrantKeyStore {
  const byId = new Map<string, McpGrantKeyRecord>();
  const liveByComposite = new Map<string, string>();

  return {
    getOrCreate: (grant: McpGrantKeyCreateInput) =>
      Effect.sync(() => {
        const key = compositeKey(grant.subject, grant.clientId, grant.resource);
        const existingId = liveByComposite.get(key);
        if (existingId) {
          const existing = byId.get(existingId);
          if (existing && existing.revokedAtMs == null) {
            return existing;
          }
        }
        const record: McpGrantKeyRecord = {
          ...grant,
          virtualKeyId: newVirtualKeyId(),
          createdAtMs: now(),
        };
        byId.set(record.virtualKeyId, record);
        liveByComposite.set(key, record.virtualKeyId);
        return record;
      }),
    get: (virtualKeyId: string) =>
      Effect.sync(() => {
        const r = byId.get(virtualKeyId);
        return r ?? null;
      }),
    revoke: (virtualKeyId: string) =>
      Effect.sync(() => {
        const r = byId.get(virtualKeyId);
        if (!r || r.revokedAtMs != null) return;
        const revoked: McpGrantKeyRecord = { ...r, revokedAtMs: now() };
        byId.set(virtualKeyId, revoked);
        const key = compositeKey(r.subject, r.clientId, r.resource);
        if (liveByComposite.get(key) === virtualKeyId) {
          liveByComposite.delete(key);
        }
      }),
  };
}

/**
 * True when grant-as-key should be active.
 * Opt-in via `CLAWQL_MCP_OAUTH_GRANT_AS_KEY=1` or an explicit `grantKeyStore` on config.
 */
export function grantAsKeyEnabled(
  env: NodeJS.ProcessEnv = process.env,
  explicitStore: boolean
): boolean {
  const flag = env.CLAWQL_MCP_OAUTH_GRANT_AS_KEY?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return explicitStore;
}

export type GrantStampInput = {
  readonly subject: string;
  readonly clientId: string;
  readonly resource?: string;
  readonly orgId?: string;
  readonly scope: readonly string[];
  readonly grantType: Exclude<McpGrantType, "refresh_token">;
};

/** Resolve or create a grant and return its virtualKeyId (never clientId). */
export function stampGrantVirtualKeyIdEffect(
  store: McpGrantKeyStore,
  input: GrantStampInput
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const grant = yield* store.getOrCreate({
      subject: input.subject,
      clientId: input.clientId,
      resource: input.resource,
      orgId: input.orgId,
      scope: [...input.scope],
      grantType: input.grantType,
    });
    return grant.virtualKeyId;
  });
}
