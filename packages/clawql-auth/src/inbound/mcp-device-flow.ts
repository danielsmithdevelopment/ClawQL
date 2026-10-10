/**
 * MCP OAuth §4 — RFC 8628 device authorization (ClawQL AS).
 *
 * Advertise `device_authorization_endpoint` in AS metadata only when a
 * DeviceCodeStore is wired on the AS. Google's endpoint was stripped for honesty.
 */

import { createHash, randomBytes } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import type { McpDeviceAuthorizationPending } from "./mcp-oauth.js";

/** Wire-format grant type for RFC 8628 device code exchange. */
export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code" as const;

export class DeviceFlowError extends Data.TaggedError("DeviceFlowError")<{
  readonly error: string;
  readonly description?: string;
}> {}

export type DeviceAuthorizationResponse = {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete: string;
  readonly expires_in: number;
  readonly interval: number;
};

export type DeviceCodeStore = {
  readonly save: (record: McpDeviceAuthorizationPending) => Effect.Effect<void>;
  readonly getByDeviceCode: (
    deviceCode: string
  ) => Effect.Effect<McpDeviceAuthorizationPending | null>;
  readonly getByUserCode: (
    userCode: string
  ) => Effect.Effect<McpDeviceAuthorizationPending | null>;
  readonly approve: (userCode: string, subject: string) => Effect.Effect<void, DeviceFlowError>;
  readonly consumeApproved: (
    deviceCode: string
  ) => Effect.Effect<McpDeviceAuthorizationPending, DeviceFlowError>;
};

function normalizeUserCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function formatUserCode(raw: string): string {
  const n = normalizeUserCode(raw);
  if (n.length <= 4) return n;
  return `${n.slice(0, 4)}-${n.slice(4, 8)}`;
}

export function createMemoryDeviceCodeStore(
  now: () => number = Date.now
): DeviceCodeStore {
  const byDevice = new Map<string, McpDeviceAuthorizationPending>();
  const byUser = new Map<string, string>();

  return {
    save: (record) =>
      Effect.sync(() => {
        byDevice.set(record.deviceCode, record);
        byUser.set(normalizeUserCode(record.userCode), record.deviceCode);
      }),
    getByDeviceCode: (deviceCode) => Effect.sync(() => byDevice.get(deviceCode) ?? null),
    getByUserCode: (userCode) =>
      Effect.sync(() => {
        const id = byUser.get(normalizeUserCode(userCode));
        return id ? (byDevice.get(id) ?? null) : null;
      }),
    approve: (userCode, subject) =>
      Effect.gen(function* () {
        const id = byUser.get(normalizeUserCode(userCode));
        const rec = id ? byDevice.get(id) : null;
        if (!rec) {
          return yield* Effect.fail(
            new DeviceFlowError({ error: "invalid_grant", description: "unknown_user_code" })
          );
        }
        if (rec.expiresAtMs <= now()) {
          return yield* Effect.fail(
            new DeviceFlowError({ error: "expired_token", description: "device_code_expired" })
          );
        }
        byDevice.set(rec.deviceCode, { ...rec, approvedSubject: subject });
      }),
    consumeApproved: (deviceCode) =>
      Effect.gen(function* () {
        const rec = byDevice.get(deviceCode);
        if (!rec) {
          return yield* Effect.fail(
            new DeviceFlowError({ error: "invalid_grant", description: "unknown_device_code" })
          );
        }
        if (rec.expiresAtMs <= now()) {
          byDevice.delete(deviceCode);
          byUser.delete(normalizeUserCode(rec.userCode));
          return yield* Effect.fail(
            new DeviceFlowError({ error: "expired_token", description: "device_code_expired" })
          );
        }
        if (!rec.approvedSubject) {
          return yield* Effect.fail(
            new DeviceFlowError({ error: "authorization_pending" })
          );
        }
        byDevice.delete(deviceCode);
        byUser.delete(normalizeUserCode(rec.userCode));
        return rec;
      }),
  };
}

export type DeviceFlowConfig = {
  readonly verificationUri: string;
  readonly expiresInSec?: number;
  readonly intervalSec?: number;
  readonly now?: () => number;
};

export function createDeviceAuthorizationEffect(
  store: DeviceCodeStore,
  config: DeviceFlowConfig,
  clientId: string
): Effect.Effect<DeviceAuthorizationResponse> {
  return Effect.gen(function* () {
    const now = config.now ?? Date.now;
    const expiresIn = config.expiresInSec ?? 600;
    const interval = config.intervalSec ?? 5;
    const deviceCode = `dvc_${randomBytes(24).toString("base64url")}`;
    const userCode = formatUserCode(randomBytes(5).toString("hex").toUpperCase());
    const record: McpDeviceAuthorizationPending = {
      deviceCode,
      userCode,
      clientId,
      expiresAtMs: now() + expiresIn * 1000,
      intervalSec: interval,
    };
    yield* store.save(record);
    const verification_uri = config.verificationUri;
    const verification_uri_complete = `${verification_uri}?user_code=${encodeURIComponent(userCode)}`;
    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri,
      verification_uri_complete,
      expires_in: expiresIn,
      interval,
    };
  });
}

/** Opaque hash for correlating device codes in audit without storing raw codes. */
export function hashDeviceCode(deviceCode: string): string {
  return createHash("sha256").update(deviceCode).digest("hex");
}

export class DeviceFlowService extends Context.Service<
  DeviceFlowService,
  {
    readonly authorize: (clientId: string) => Effect.Effect<DeviceAuthorizationResponse>;
    readonly approve: (userCode: string, subject: string) => Effect.Effect<void, DeviceFlowError>;
    readonly poll: (
      deviceCode: string
    ) => Effect.Effect<McpDeviceAuthorizationPending, DeviceFlowError>;
  }
>()("clawql/DeviceFlowService") {}

export function deviceFlowServiceLayer(
  store: DeviceCodeStore,
  config: DeviceFlowConfig
): Layer.Layer<DeviceFlowService> {
  return Layer.succeed(
    DeviceFlowService,
    DeviceFlowService.of({
      authorize: (clientId) => createDeviceAuthorizationEffect(store, config, clientId),
      approve: (userCode, subject) => store.approve(userCode, subject),
      poll: (deviceCode) => store.consumeApproved(deviceCode),
    })
  );
}
