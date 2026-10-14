import { Effect } from "effect";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readManagedDataSource } from "@/lib/managed/data-source";

export type ManagedPushDevice = {
  readonly id: string;
  readonly token: string;
  readonly platform: "ios" | "android" | "web";
  readonly label: string;
  readonly userId?: string;
  readonly registeredAtMs: number;
  readonly fixture: boolean;
};

function resolveDevicesPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAWQL_PUSH_DEVICES_PATH?.trim();
  if (override) return override;
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Auth", "push-devices.json");
}

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
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<
  {
    readonly devices: ManagedPushDevice[];
    readonly source: "live" | "fixture";
  },
  Error
> =>
  Effect.gen(function* () {
    if (readManagedDataSource(env) === "fixture") {
      return { devices: [] as ManagedPushDevice[], source: "fixture" as const };
    }
    const path = resolveDevicesPath(env);
    const devices = yield* readDevicesFileEffect(path);
    return { devices, source: "live" as const };
  });

export const registerManagedPushDeviceEffect = (input: {
  readonly token: string;
  readonly platform: "ios" | "android" | "web";
  readonly label?: string;
  readonly userId?: string;
  readonly fixture?: boolean;
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
    const path = resolveDevicesPath(env);
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
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly cleared: number; readonly source: "live" }, Error> =>
  Effect.gen(function* () {
    const env = input?.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail(new Error("Push clear disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture"));
    }
    const path = resolveDevicesPath(env);
    const existing = yield* readDevicesFileEffect(path);
    const userId = input?.userId?.trim();
    const kept = userId
      ? existing.filter((d) => d.userId !== userId)
      : [];
    const cleared = existing.length - kept.length;
    yield* writeDevicesFileEffect(path, kept);
    return { cleared, source: "live" as const };
  });
