import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { resolvePayoutPreferencesPath } from "../config/paths.js";

export type PayoutMethod = "bank" | "usdc";

export type CreatorPayoutPreference = {
  readonly creatorId: string;
  readonly method: PayoutMethod;
  readonly connectAccountId?: string;
  readonly usdcWallet?: string;
  readonly email?: string;
  readonly updatedAt: string;
};

type PrefFile = {
  creators: Record<string, CreatorPayoutPreference>;
};

async function loadFile(env: NodeJS.ProcessEnv): Promise<PrefFile> {
  const path = resolvePayoutPreferencesPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PrefFile;
    if (!parsed || typeof parsed !== "object" || !parsed.creators) return { creators: {} };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { creators: {} };
    throw err;
  }
}

async function saveFile(file: PrefFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolvePayoutPreferencesPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

/** @deprecated Prefer PayoutPreferencesService.get — Promise façade retained for legacy callers. */
export async function getCreatorPayoutPreference(
  creatorId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreatorPayoutPreference | undefined> {
  const file = await loadFile(env);
  return file.creators[creatorId.trim()];
}

/** @deprecated Prefer PayoutPreferencesService.set — Promise façade retained for legacy callers. */
export async function setCreatorPayoutPreference(
  input: {
    creatorId: string;
    method: PayoutMethod;
    connectAccountId?: string;
    usdcWallet?: string;
    email?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CreatorPayoutPreference> {
  const file = await loadFile(env);
  const pref: CreatorPayoutPreference = {
    creatorId: input.creatorId.trim(),
    method: input.method,
    connectAccountId: input.connectAccountId?.trim() || undefined,
    usdcWallet: input.usdcWallet?.trim() || undefined,
    email: input.email?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  file.creators[pref.creatorId] = pref;
  await saveFile(file, env);
  return pref;
}

export class PayoutPreferencesError extends Data.TaggedError("PayoutPreferencesError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

type SetCreatorPayoutPreferenceInput = Parameters<typeof setCreatorPayoutPreference>[0];

/** Effect surface over creator payout preferences (bank / USDC destination + connect account). */
export class PayoutPreferencesService extends Context.Tag("clawql/PayoutPreferencesService")<
  PayoutPreferencesService,
  {
    readonly get: (
      creatorId: string
    ) => Effect.Effect<CreatorPayoutPreference | undefined, PayoutPreferencesError>;
    readonly set: (
      input: SetCreatorPayoutPreferenceInput
    ) => Effect.Effect<CreatorPayoutPreference, PayoutPreferencesError>;
  }
>() {}

export function payoutPreferencesLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PayoutPreferencesService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof PayoutPreferencesError
          ? cause
          : new PayoutPreferencesError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    PayoutPreferencesService,
    PayoutPreferencesService.of({
      get: (creatorId) =>
        run("Failed to load payout preference", () => getCreatorPayoutPreference(creatorId, env)),
      set: (input) =>
        run("Failed to write payout preference", () => setCreatorPayoutPreference(input, env)),
    })
  );
}
