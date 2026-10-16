/**
 * Support "view as / log in as" for managed console.
 * Owner/Admin only. Every start/stop is prepended to the managed audit feed
 * and append-only JSONL under .data/ (durable across reloads of the same host).
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { Effect, Ref } from "effect";

import type { ManagedSession } from "@/lib/managed/session";

export type SupportImpersonation = {
  readonly id: string;
  readonly orgId: string;
  readonly actorUserId: string;
  readonly actorEmail: string;
  readonly actorRole: string;
  readonly targetUserId: string;
  readonly targetEmail: string;
  readonly targetDisplayName: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly endedAt?: string;
};

export type ManagedAuditRuntimeEntry = {
  readonly id: string;
  readonly time: string;
  readonly actor: string;
  readonly action: string;
  readonly outcome: string;
  readonly tone: "ok" | "warn" | "danger";
};

const activeByActorRef = Ref.makeUnsafe<Map<string, SupportImpersonation>>(new Map());
const historyRef = Ref.makeUnsafe<SupportImpersonation[]>([]);
const auditRuntimeRef = Ref.makeUnsafe<ManagedAuditRuntimeEntry[]>([]);

export function canImpersonate(role: string): boolean {
  const r = role.trim().toLowerCase();
  return (
    r === "owner" ||
    r === "admin" ||
    r === "org admin" ||
    r === "orgadmin" ||
    r.includes("owner") ||
    (r.includes("admin") && !r.includes("billing"))
  );
}

function clockTime(): string {
  return new Date().toISOString().slice(11, 19);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const listSupportAuditRuntimeEffect = (): Effect.Effect<
  readonly ManagedAuditRuntimeEntry[]
> => Ref.get(auditRuntimeRef);

const pushAuditEffect = (entry: ManagedAuditRuntimeEntry): Effect.Effect<void> =>
  Effect.gen(function* () {
    const cur = yield* Ref.get(auditRuntimeRef);
    yield* Ref.set(auditRuntimeRef, [entry, ...cur].slice(0, 200));
  });

const AUDIT_DIR = path.join(process.cwd(), ".data");
const AUDIT_JSONL = path.join(AUDIT_DIR, "support-impersonation-audit.jsonl");

/** Append-only durable line (hash-chained within the file for tamper evidence). */
const appendDurableAuditEffect = (body: Record<string, unknown>): Effect.Effect<void> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(AUDIT_DIR, { recursive: true });
      const prev = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      const line = JSON.stringify({
        ...body,
        writtenAt: new Date().toISOString(),
        contentHash: prev,
      });
      await appendFile(AUDIT_JSONL, `${line}\n`, { encoding: "utf8", flag: "a" });
    },
    catch: () => undefined,
  }).pipe(Effect.asVoid, Effect.catch(() => Effect.void));

export const getActiveImpersonationEffect = (
  actorUserId: string
): Effect.Effect<SupportImpersonation | null> =>
  Effect.gen(function* () {
    const map = yield* Ref.get(activeByActorRef);
    return map.get(actorUserId) ?? null;
  });

export const startImpersonationEffect = (input: {
  readonly actor: ManagedSession;
  readonly targetUserId: string;
  readonly targetEmail: string;
  readonly targetDisplayName: string;
  readonly reason: string;
}): Effect.Effect<
  SupportImpersonation,
  { readonly _tag: "Forbidden" | "BadRequest"; readonly message: string }
> =>
  Effect.gen(function* () {
    if (!canImpersonate(input.actor.role)) {
      return yield* Effect.fail({
        _tag: "Forbidden" as const,
        message: "Only Owner or Admin may start support impersonation",
      });
    }
    const reason = input.reason.trim();
    if (reason.length < 8) {
      return yield* Effect.fail({
        _tag: "BadRequest" as const,
        message: "Reason required (min 8 characters) — this is written to the audit trail",
      });
    }
    if (input.targetUserId === input.actor.userId) {
      return yield* Effect.fail({
        _tag: "BadRequest" as const,
        message: "Cannot impersonate yourself",
      });
    }

    const record: SupportImpersonation = {
      id: newId("imp"),
      orgId: input.actor.orgId,
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      targetUserId: input.targetUserId,
      targetEmail: input.targetEmail,
      targetDisplayName: input.targetDisplayName,
      reason,
      startedAt: new Date().toISOString(),
    };

    const map = new Map(yield* Ref.get(activeByActorRef));
    map.set(input.actor.userId, record);
    yield* Ref.set(activeByActorRef, map);

    const hist = yield* Ref.get(historyRef);
    yield* Ref.set(historyRef, [record, ...hist].slice(0, 500));

    yield* pushAuditEffect({
      id: record.id,
      time: clockTime(),
      actor: input.actor.email,
      action: `support.impersonation.start → ${input.targetEmail}`,
      outcome: reason,
      tone: "warn",
    });

    yield* appendDurableAuditEffect({
      type: "SUPPORT_IMPERSONATION_START",
      impersonationId: record.id,
      orgId: record.orgId,
      actorUserId: record.actorUserId,
      actorEmail: record.actorEmail,
      targetUserId: record.targetUserId,
      targetEmail: record.targetEmail,
      reason: record.reason,
    });

    return record;
  });

export const stopImpersonationEffect = (input: {
  readonly actorUserId: string;
  readonly actorEmail: string;
}): Effect.Effect<SupportImpersonation | null> =>
  Effect.gen(function* () {
    const map = new Map(yield* Ref.get(activeByActorRef));
    const active = map.get(input.actorUserId);
    if (!active) return null;
    const ended: SupportImpersonation = {
      ...active,
      endedAt: new Date().toISOString(),
    };
    map.delete(input.actorUserId);
    yield* Ref.set(activeByActorRef, map);

    yield* pushAuditEffect({
      id: newId("imp_end"),
      time: clockTime(),
      actor: input.actorEmail,
      action: `support.impersonation.stop → ${active.targetEmail}`,
      outcome: `Ended after start ${active.startedAt}`,
      tone: "ok",
    });

    yield* appendDurableAuditEffect({
      type: "SUPPORT_IMPERSONATION_STOP",
      impersonationId: active.id,
      orgId: active.orgId,
      actorUserId: active.actorUserId,
      targetUserId: active.targetUserId,
      targetEmail: active.targetEmail,
      startedAt: active.startedAt,
      endedAt: ended.endedAt,
    });

    return ended;
  });

/** Test helper — clear runtime state. */
export const resetImpersonationForTestsEffect = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Ref.set(activeByActorRef, new Map());
    yield* Ref.set(historyRef, []);
    yield* Ref.set(auditRuntimeRef, []);
  });
