import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer, Data } from "effect";
import { resolvePaymentsDir } from "../config/paths.js";
import type { TaxFormKind, TaxProfile } from "./types.js";

export function resolveTaxProfilesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "tax-profiles.json");
}

type TaxProfileFile = {
  parties: Record<string, TaxProfile>;
};

async function loadFile(env: NodeJS.ProcessEnv): Promise<TaxProfileFile> {
  const path = resolveTaxProfilesPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as TaxProfileFile;
    if (!parsed || typeof parsed !== "object" || !parsed.parties) return { parties: {} };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { parties: {} };
    throw err;
  }
}

async function saveFile(file: TaxProfileFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveTaxProfilesPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export function isTaxProfileEnforceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_TAX_PROFILE_ENFORCE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isTaxFormKind(value: string): value is TaxFormKind {
  return value === "1099nec" || value === "none" || value === "unknown";
}

export async function getTaxProfile(
  partyId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<TaxProfile | undefined> {
  const file = await loadFile(env);
  return file.parties[partyId.trim()];
}

export async function setTaxProfile(
  input: {
    partyId: string;
    taxForm: TaxFormKind;
    collected?: boolean;
    taxProfileRef?: string;
    note?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<TaxProfile> {
  const file = await loadFile(env);
  const partyId = input.partyId.trim();
  if (!partyId) throw new Error("partyId required");
  const ssnLike = /\b\d{3}-\d{2}-\d{4}\b/;
  if (ssnLike.test(input.note ?? "") || ssnLike.test(input.taxProfileRef ?? "")) {
    throw new Error(
      "Refuse possible raw tax ID in tax profile — store only opaque refs (vault / Stripe / KYC vendor)"
    );
  }
  const profile: TaxProfile = {
    partyId,
    taxForm: input.taxForm,
    collected: Boolean(input.collected),
    taxProfileRef: input.taxProfileRef?.trim() || undefined,
    note: input.note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  file.parties[partyId] = profile;
  await saveFile(file, env);
  return profile;
}

export async function listTaxProfiles(
  env: NodeJS.ProcessEnv = process.env
): Promise<TaxProfile[]> {
  const file = await loadFile(env);
  return Object.values(file.parties).sort((a, b) => a.partyId.localeCompare(b.partyId));
}

export class TaxProfileError extends Data.TaggedError("TaxProfileError")<{
  readonly reason: string;
  readonly partyId?: string;
}> {}

/**
 * Port: payout / cash-out may require a collected tax profile when enforce is on.
 * Implementations must never return SSN/ITIN — only opaque readiness.
 */
export class TaxProfileService extends Context.Tag("clawql/TaxProfileService")<
  TaxProfileService,
  {
    readonly get: (partyId: string) => Effect.Effect<TaxProfile | undefined, TaxProfileError>;
    readonly requireForPayout: (
      partyId: string
    ) => Effect.Effect<TaxProfile | undefined, TaxProfileError>;
  }
>() {}

export function taxProfileLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TaxProfileService> {
  return Layer.succeed(TaxProfileService, {
    get: (partyId) =>
      Effect.tryPromise({
        try: () => getTaxProfile(partyId, env),
        catch: (cause) =>
          new TaxProfileError({
            reason: cause instanceof Error ? cause.message : "tax profile load failed",
            partyId,
          }),
      }),
    requireForPayout: (partyId) =>
      Effect.gen(function* () {
        if (!isTaxProfileEnforceEnabled(env)) {
          return undefined;
        }
        const id = partyId.trim();
        if (!id) {
          return yield* Effect.fail(
            new TaxProfileError({
              reason: "partyId required when CLAWQL_TAX_PROFILE_ENFORCE is on",
            })
          );
        }
        const profile = yield* Effect.tryPromise({
          try: () => getTaxProfile(id, env),
          catch: (cause) =>
            new TaxProfileError({
              reason: cause instanceof Error ? cause.message : "tax profile load failed",
              partyId: id,
            }),
        });
        if (!profile) {
          return yield* Effect.fail(
            new TaxProfileError({
              reason: `Tax profile missing for ${id} — run: clawql payments tax-profile set --party-id ${id} --tax-form 1099nec --collected`,
              partyId: id,
            })
          );
        }
        if (profile.taxForm === "none") {
          return profile;
        }
        if (!profile.collected) {
          return yield* Effect.fail(
            new TaxProfileError({
              reason: `Tax profile for ${id} is not marked collected (W-9/W-8) — refuse payout`,
              partyId: id,
            })
          );
        }
        return profile;
      }),
  });
}
