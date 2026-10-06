/**
 * File-backed resumable account-deletion jobs (per-step status).
 * Path: `$CLAWQL_HOME/Auth/account-deletion-jobs.json`.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Data, Effect, Layer, Semaphore } from "effect";

export const ACCOUNT_DELETION_STEPS = ["keys", "org", "stripe", "vault", "supabase"] as const;
export type AccountDeletionStepId = (typeof ACCOUNT_DELETION_STEPS)[number];

export type AccountDeletionStepStatus = "pending" | "completed" | "skipped" | "failed";

export type AccountDeletionStepState = {
  readonly status: AccountDeletionStepStatus;
  readonly error?: string;
  readonly completedAt?: string;
  readonly keysRevoked?: number;
  readonly orgsDeleted?: number;
  readonly stripeCustomersDeleted?: number;
  readonly vaultNotesErased?: number;
  readonly supabaseUserDeleted?: boolean;
};

export type AccountDeletionJobStatus = "pending" | "in_progress" | "failed" | "completed";

export type AccountDeletionJob = {
  readonly jobId: string;
  readonly clawqlUserId: string;
  readonly status: AccountDeletionJobStatus;
  readonly orgIds: readonly string[];
  readonly stripeCustomerIds: readonly string[];
  readonly supabaseSubjects: readonly string[];
  readonly steps: Record<AccountDeletionStepId, AccountDeletionStepState>;
  readonly identityDeleted: boolean;
  readonly wormWritten: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly correlationId?: string;
};

export type AccountDeletionJobFile = {
  readonly version: 1;
  readonly jobs: readonly AccountDeletionJob[];
};

export class AccountDeletionJobStoreError extends Data.TaggedError("AccountDeletionJobStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type AccountDeletionJobStoreOptions = {
  readonly path: string;
};

const emptyStep = (): AccountDeletionStepState => ({ status: "pending" });

export const emptyAccountDeletionStepsEffect = (): Effect.Effect<
  Record<AccountDeletionStepId, AccountDeletionStepState>
> =>
  Effect.sync(() => ({
    keys: emptyStep(),
    org: emptyStep(),
    stripe: emptyStep(),
    vault: emptyStep(),
    supabase: emptyStep(),
  }));

export const generateAccountDeletionJobIdEffect = (): Effect.Effect<string> =>
  Effect.sync(() => `adj_${randomBytes(16).toString("hex")}`);

export const defaultAccountDeletionJobsPathEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(() => {
    const override = env.CLAWQL_ACCOUNT_DELETION_JOBS_PATH?.trim();
    if (override) return override;
    const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
    return join(home, "Auth", "account-deletion-jobs.json");
  });

export const isAccountDeletionJobIdEffect = (jobId: string): Effect.Effect<boolean> =>
  Effect.sync(() => /^adj_[a-f0-9]{32}$/.test(jobId.trim()));

export const accountDeletionSystemsCompleteEffect = (
  job: AccountDeletionJob
): Effect.Effect<boolean> =>
  Effect.sync(() =>
    ACCOUNT_DELETION_STEPS.every((id) => {
      const status = job.steps[id].status;
      return status === "completed" || status === "skipped";
    })
  );

function emptyStore(): AccountDeletionJobFile {
  return { version: 1, jobs: [] };
}

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function loadJobsSync(path: string): AccountDeletionJobFile {
  try {
    if (!existsSync(path)) return emptyStore();
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AccountDeletionJobFile;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      version: 1,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return emptyStore();
  }
}

const isOpenStatus = (status: AccountDeletionJobStatus): boolean =>
  status === "pending" || status === "in_progress" || status === "failed";

export class AccountDeletionJobStoreService extends Context.Service<
  AccountDeletionJobStoreService,
  {
    readonly path: string;
    readonly get: (
      jobId: string
    ) => Effect.Effect<AccountDeletionJob | undefined, AccountDeletionJobStoreError>;
    readonly findOpenByUserId: (
      clawqlUserId: string
    ) => Effect.Effect<AccountDeletionJob | undefined, AccountDeletionJobStoreError>;
    readonly create: (
      job: AccountDeletionJob
    ) => Effect.Effect<AccountDeletionJob, AccountDeletionJobStoreError>;
    readonly save: (
      job: AccountDeletionJob
    ) => Effect.Effect<AccountDeletionJob, AccountDeletionJobStoreError>;
  }
>()("clawql/AccountDeletionJobStoreService") {}

export function createAccountDeletionJobStoreLayer(
  options: AccountDeletionJobStoreOptions
): Layer.Layer<AccountDeletionJobStoreService> {
  const mutex = Semaphore.makeUnsafe(1);

  const load = (): Effect.Effect<AccountDeletionJobFile> =>
    Effect.sync(() => loadJobsSync(options.path));

  const persist = (
    store: AccountDeletionJobFile
  ): Effect.Effect<void, AccountDeletionJobStoreError> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(options.path), { recursive: true });
        await writeFile(options.path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
      },
      catch: (cause) =>
        new AccountDeletionJobStoreError({
          reason: `Failed to save deletion jobs: ${errMsg(cause)}`,
          cause,
        }),
    });

  const mutate = <A>(
    fn: (
      store: AccountDeletionJobFile
    ) => Effect.Effect<{ store: AccountDeletionJobFile; value: A }, AccountDeletionJobStoreError>
  ): Effect.Effect<A, AccountDeletionJobStoreError> =>
    mutex.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* load();
        const { store, value } = yield* fn(current);
        yield* persist(store);
        return value;
      })
    );

  return Layer.succeed(
    AccountDeletionJobStoreService,
    AccountDeletionJobStoreService.of({
      path: options.path,
      get: (jobId) =>
        load().pipe(Effect.map((file) => file.jobs.find((j) => j.jobId === jobId.trim()))),
      findOpenByUserId: (clawqlUserId) =>
        load().pipe(
          Effect.map((file) =>
            file.jobs.find((j) => j.clawqlUserId === clawqlUserId.trim() && isOpenStatus(j.status))
          )
        ),
      create: (job) =>
        mutate((file) =>
          Effect.succeed({
            store: { version: 1 as const, jobs: [...file.jobs, job] },
            value: job,
          })
        ),
      save: (job) =>
        mutate((file) =>
          Effect.succeed({
            store: {
              version: 1 as const,
              jobs: file.jobs.some((j) => j.jobId === job.jobId)
                ? file.jobs.map((j) => (j.jobId === job.jobId ? job : j))
                : [...file.jobs, job],
            },
            value: job,
          })
        ),
    })
  );
}

export function accountDeletionJobStoreLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AccountDeletionJobStoreService> {
  const path = Effect.runSync(defaultAccountDeletionJobsPathEffect(env));
  return createAccountDeletionJobStoreLayer({ path });
}
