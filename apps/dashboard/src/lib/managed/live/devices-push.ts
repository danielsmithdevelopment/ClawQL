import { Effect } from "effect";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { readManagedDataSource } from "@/lib/managed/data-source";
import { resolveManagedStorePathEffect } from "@/lib/managed/org-home";

export type ManagedPushDevice = {
  readonly id: string;
  readonly token: string;
  readonly platform: "ios" | "android" | "web";
  readonly label: string;
  readonly userId?: string;
  readonly registeredAtMs: number;
  readonly fixture: boolean;
};

const resolveDevicesPathEffect = (input: {
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<string, Error> =>
  resolveManagedStorePathEffect({
    orgId: input.orgId,
    segments: ["Auth", "push-devices.json"],
    overrideEnvKey: "CLAWQL_PUSH_DEVICES_PATH",
    env: input.env,
  }).pipe(Effect.mapError((e) => new Error(e.detail ?? e.reason)));

const readDevicesFileEffect = (
  path: string,
): Effect.Effect<ManagedPushDevice[], Error> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as { devices?: ManagedPushDevice[] };
        return Array.isArray(parsed.devices) ? parsed.devices : [];
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

const writeDevicesFileEffect = (
  path: string,
  devices: readonly ManagedPushDevice[],
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({ version: 1, devices }, null, 2)}\n`, "utf8");
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listManagedPushDevicesEffect = (
  input: {
    readonly orgId?: string | null;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Effect.Effect<
  {
    readonly devices: ManagedPushDevice[];
    readonly source: "live" | "fixture";
  },
  Error
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return { devices: [] as ManagedPushDevice[], source: "fixture" as const };
    }
    const path = yield* resolveDevicesPathEffect({ orgId: input.orgId, env });
    const devices = yield* readDevicesFileEffect(path);
    return { devices, source: "live" as const };
  });

export const registerManagedPushDeviceEffect = (input: {
  readonly token: string;
  readonly platform: "ios" | "android" | "web";
  readonly label?: string;
  readonly userId?: string;
  readonly fixture?: boolean;
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly device: ManagedPushDevice; readonly source: "live" },
  Error
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail(new Error("Push register disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture"));
    }
    const token = input.token.trim();
    if (!token) return yield* Effect.fail(new Error("token required"));
    const path = yield* resolveDevicesPathEffect({ orgId: input.orgId, env });
    const existing = yield* readDevicesFileEffect(path);
    const device: ManagedPushDevice = {
      id: `push_${input.platform}_${token.slice(-12)}`,
      token,
      platform: input.platform,
      label: input.label?.trim() || "Phone",
      userId: input.userId?.trim() || undefined,
      registeredAtMs: Date.now(),
      fixture: Boolean(input.fixture),
    };
    const next = [device, ...existing.filter((d) => d.token !== token)];
    yield* writeDevicesFileEffect(path, next);
    return { device, source: "live" as const };
  });

export const clearManagedPushDevicesEffect = (input?: {
  readonly userId?: string;
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly cleared: number; readonly source: "live" }, Error> =>
  Effect.gen(function* () {
    const env = input?.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail(new Error("Push clear disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture"));
    }
    const path = yield* resolveDevicesPathEffect({ orgId: input?.orgId, env });
    const existing = yield* readDevicesFileEffect(path);
    const userId = input?.userId?.trim();
    const kept = userId
      ? existing.filter((d) => d.userId !== userId)
      : [];
    const cleared = existing.length - kept.length;
    yield* writeDevicesFileEffect(path, kept);
    return { cleared, source: "live" as const };
  });
