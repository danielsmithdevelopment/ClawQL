/**
 * File-backed ClawQL user identity store (linked IdP subjects → `usr_…`).
 * Path is chosen by the host (default `$CLAWQL_HOME/Auth/identities.json`).
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Data, Effect, Layer, Semaphore } from "effect";

import type {
  ClawqlUserRecord,
  GetOrCreateLinkedIdentityInput,
  IdentityStoreFile,
  LinkedIdentity,
  LinkedIdentityProvider,
} from "./types.js";

export class IdentityStoreError extends Data.TaggedError("IdentityStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type IdentityStoreOptions = {
  readonly path: string;
};

function emptyStore(): IdentityStoreFile {
  return { version: 1, users: [] };
}

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const linkedIdentityKeyEffect = (provider: string, subject: string): Effect.Effect<string> =>
  Effect.sync(() => `${provider.trim().toLowerCase()}:${subject.trim()}`);

export const generateClawqlUserIdEffect = (): Effect.Effect<string> =>
  Effect.sync(() => `usr_${randomBytes(8).toString("hex")}`);

export const defaultIdentitiesPathEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(() => {
    const override = env.CLAWQL_IDENTITIES_PATH?.trim();
    if (override) return override;
    const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
    return join(home, "Auth", "identities.json");
  });

function loadIdentityStoreSync(path: string): IdentityStoreFile {
  try {
    if (!existsSync(path)) return emptyStore();
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IdentityStoreFile;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      version: 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  } catch {
    return emptyStore();
  }
}

function findByLinked(
  users: readonly ClawqlUserRecord[],
  provider: string,
  subject: string
): ClawqlUserRecord | undefined {
  const p = provider.trim().toLowerCase();
  const s = subject.trim();
  return users.find(
    (u) => !u.deletedAt && u.identities.some((i) => i.provider === p && i.subject === s)
  );
}

export class IdentityStoreService extends Context.Service<
  IdentityStoreService,
  {
    readonly path: string;
    readonly load: () => Effect.Effect<IdentityStoreFile>;
    readonly getByUserId: (
      userId: string
    ) => Effect.Effect<ClawqlUserRecord | undefined, IdentityStoreError>;
    readonly getByLinkedIdentity: (
      provider: LinkedIdentityProvider,
      subject: string
    ) => Effect.Effect<ClawqlUserRecord | undefined, IdentityStoreError>;
    readonly getOrCreateFromLinkedIdentity: (
      input: GetOrCreateLinkedIdentityInput
    ) => Effect.Effect<ClawqlUserRecord, IdentityStoreError>;
    readonly linkIdentity: (input: {
      userId: string;
      provider: LinkedIdentityProvider;
      subject: string;
    }) => Effect.Effect<ClawqlUserRecord, IdentityStoreError>;
    readonly recordOrgId: (input: {
      userId: string;
      orgId: string;
    }) => Effect.Effect<ClawqlUserRecord, IdentityStoreError>;
    readonly recordStripeCustomerId: (input: {
      userId: string;
      stripeCustomerId: string;
    }) => Effect.Effect<ClawqlUserRecord, IdentityStoreError>;
    readonly deleteUser: (
      userId: string
    ) => Effect.Effect<ClawqlUserRecord | undefined, IdentityStoreError>;
  }
>()("clawql/IdentityStoreService") {}

export function createIdentityStoreLayer(
  options: IdentityStoreOptions
): Layer.Layer<IdentityStoreService> {
  const mutex = Semaphore.makeUnsafe(1);

  const load = (): Effect.Effect<IdentityStoreFile> =>
    Effect.sync(() => loadIdentityStoreSync(options.path));

  const persist = (store: IdentityStoreFile): Effect.Effect<void, IdentityStoreError> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(options.path), { recursive: true });
        await writeFile(options.path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
      },
      catch: (cause) =>
        new IdentityStoreError({ reason: `Failed to save identities: ${errMsg(cause)}`, cause }),
    });

  const mutate = <A>(
    fn: (
      store: IdentityStoreFile
    ) => Effect.Effect<{ store: IdentityStoreFile; value: A }, IdentityStoreError>
  ): Effect.Effect<A, IdentityStoreError> =>
    mutex.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* load();
        const { store, value } = yield* fn(current);
        yield* persist(store);
        return value;
      })
    );

  return Layer.succeed(
    IdentityStoreService,
    IdentityStoreService.of({
      path: options.path,
      load,
      getByUserId: (userId) =>
        load().pipe(
          Effect.map((file) => file.users.find((u) => u.userId === userId.trim() && !u.deletedAt))
        ),
      getByLinkedIdentity: (provider, subject) =>
        load().pipe(Effect.map((file) => findByLinked(file.users, provider, subject))),
      getOrCreateFromLinkedIdentity: (input) =>
        mutate((file) =>
          Effect.gen(function* () {
            const existing = findByLinked(file.users, input.provider, input.subject);
            if (existing) {
              const email = input.email?.trim().toLowerCase();
              if (email && email !== existing.email) {
                const now = new Date().toISOString();
                const updated: ClawqlUserRecord = { ...existing, email, updatedAt: now };
                return {
                  store: {
                    version: 1 as const,
                    users: file.users.map((u) => (u.userId === existing.userId ? updated : u)),
                  },
                  value: updated,
                };
              }
              return { store: file, value: existing };
            }
            const userId = yield* generateClawqlUserIdEffect();
            const now = new Date().toISOString();
            const identity: LinkedIdentity = {
              provider: input.provider.trim().toLowerCase() as LinkedIdentityProvider,
              subject: input.subject.trim(),
              linkedAt: now,
            };
            const created: ClawqlUserRecord = {
              userId,
              email: input.email?.trim().toLowerCase() || undefined,
              identities: [identity],
              orgIds: [],
              createdAt: now,
              updatedAt: now,
            };
            return {
              store: { version: 1 as const, users: [...file.users, created] },
              value: created,
            };
          })
        ),
      linkIdentity: (input) =>
        mutate((file) =>
          Effect.gen(function* () {
            const taken = findByLinked(file.users, input.provider, input.subject);
            if (taken && taken.userId !== input.userId.trim()) {
              return yield* Effect.fail(
                new IdentityStoreError({
                  reason: `Identity ${input.provider}:${input.subject} already linked`,
                })
              );
            }
            const user = file.users.find((u) => u.userId === input.userId.trim() && !u.deletedAt);
            if (!user) {
              return yield* Effect.fail(
                new IdentityStoreError({ reason: `Unknown ClawQL user: ${input.userId}` })
              );
            }
            if (taken?.userId === user.userId) {
              return { store: file, value: user };
            }
            const now = new Date().toISOString();
            const identity: LinkedIdentity = {
              provider: input.provider.trim().toLowerCase() as LinkedIdentityProvider,
              subject: input.subject.trim(),
              linkedAt: now,
            };
            const updated: ClawqlUserRecord = {
              ...user,
              identities: [...user.identities, identity],
              updatedAt: now,
            };
            return {
              store: {
                version: 1 as const,
                users: file.users.map((u) => (u.userId === user.userId ? updated : u)),
              },
              value: updated,
            };
          })
        ),
      recordOrgId: (input) =>
        mutate((file) =>
          Effect.gen(function* () {
            const user = file.users.find((u) => u.userId === input.userId.trim() && !u.deletedAt);
            if (!user) {
              return yield* Effect.fail(
                new IdentityStoreError({ reason: `Unknown ClawQL user: ${input.userId}` })
              );
            }
            const orgId = input.orgId.trim().toLowerCase();
            if (user.orgIds.includes(orgId)) {
              return { store: file, value: user };
            }
            const updated: ClawqlUserRecord = {
              ...user,
              orgIds: [...user.orgIds, orgId],
              updatedAt: new Date().toISOString(),
            };
            return {
              store: {
                version: 1 as const,
                users: file.users.map((u) => (u.userId === user.userId ? updated : u)),
              },
              value: updated,
            };
          })
        ),
      recordStripeCustomerId: (input) =>
        mutate((file) =>
          Effect.gen(function* () {
            const user = file.users.find((u) => u.userId === input.userId.trim() && !u.deletedAt);
            if (!user) {
              return yield* Effect.fail(
                new IdentityStoreError({ reason: `Unknown ClawQL user: ${input.userId}` })
              );
            }
            const updated: ClawqlUserRecord = {
              ...user,
              stripeCustomerId: input.stripeCustomerId.trim(),
              updatedAt: new Date().toISOString(),
            };
            return {
              store: {
                version: 1 as const,
                users: file.users.map((u) => (u.userId === user.userId ? updated : u)),
              },
              value: updated,
            };
          })
        ),
      deleteUser: (userId) =>
        mutate((file) =>
          Effect.sync(() => {
            const id = userId.trim();
            const user = file.users.find((u) => u.userId === id);
            if (!user) {
              return { store: file, value: undefined };
            }
            return {
              store: { version: 1 as const, users: file.users.filter((u) => u.userId !== id) },
              value: user,
            };
          })
        ),
    })
  );
}

/** Isolated in-process identity store for tests (temp path). */
export function identityStoreLayerForPath(path: string): Layer.Layer<IdentityStoreService> {
  return createIdentityStoreLayer({ path });
}

export function identityStoreLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<IdentityStoreService> {
  const path = Effect.runSync(defaultIdentitiesPathEffect(env));
  return createIdentityStoreLayer({ path });
}
