import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

export async function getCreatorPayoutPreference(
  creatorId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreatorPayoutPreference | undefined> {
  const file = await loadFile(env);
  return file.creators[creatorId.trim()];
}

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
