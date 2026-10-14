import { Effect } from "effect";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readManagedDataSource } from "@/lib/managed/data-source";

export type ManagedEvidenceAttachment = {
  readonly id: string;
  readonly reviewId: string;
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly source: "camera" | "library";
  readonly capturedAtMs: number;
  readonly bytes?: number;
};

function resolveEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAWQL_EVIDENCE_PATH?.trim();
  if (override) return override;
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Auth", "review-evidence.json");
}

const readEvidenceFileEffect = (
  path: string,
): Effect.Effect<ManagedEvidenceAttachment[], Error> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as { attachments?: ManagedEvidenceAttachment[] };
        return Array.isArray(parsed.attachments) ? parsed.attachments : [];
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

const writeEvidenceFileEffect = (
  path: string,
  attachments: readonly ManagedEvidenceAttachment[],
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `${JSON.stringify({ version: 1, attachments }, null, 2)}\n`,
        "utf8",
      );
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listManagedEvidenceEffect = (input: {
  readonly reviewId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{
  readonly attachments: ManagedEvidenceAttachment[];
  readonly source: "live" | "fixture";
}> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return { attachments: [], source: "fixture" as const };
    }
    const all = yield* readEvidenceFileEffect(resolveEvidencePath(env));
    return {
      attachments: all.filter((a) => a.reviewId === input.reviewId),
      source: "live" as const,
    };
  });

export const addManagedEvidenceEffect = (input: {
  readonly attachment: ManagedEvidenceAttachment;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly attachment: ManagedEvidenceAttachment; readonly source: "live" },
  Error
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail(new Error("Evidence upload disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture"));
    }
    const att = input.attachment;
    if (!att.id?.trim() || !att.reviewId?.trim() || !att.uri?.trim()) {
      return yield* Effect.fail(new Error("id, reviewId, and uri required"));
    }
    const path = resolveEvidencePath(env);
    const existing = yield* readEvidenceFileEffect(path);
    const next = [att, ...existing.filter((a) => a.id !== att.id)];
    yield* writeEvidenceFileEffect(path, next);
    return { attachment: att, source: "live" as const };
  });

export const removeManagedEvidenceEffect = (input: {
  readonly reviewId: string;
  readonly attachmentId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly ok: true; readonly source: "live" }, Error> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail(new Error("Evidence remove disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture"));
    }
    const path = resolveEvidencePath(env);
    const existing = yield* readEvidenceFileEffect(path);
    const next = existing.filter(
      (a) => !(a.reviewId === input.reviewId && a.id === input.attachmentId),
    );
    if (next.length === existing.length) {
      return yield* Effect.fail(new Error("attachment_not_found"));
    }
    yield* writeEvidenceFileEffect(path, next);
    return { ok: true as const, source: "live" as const };
  });
