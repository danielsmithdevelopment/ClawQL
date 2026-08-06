/**
 * Money requests / invoices — ask someone to pay prepaid credits.
 *
 * Addressing: email (default, can invite off-platform), @username, or tenant id.
 * Accept → stages a credits transfer (same 2PC + optional TOTP as pay).
 * Emails / invite tokens never go in payment WORM.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { resolveMoneyRequestsPath } from "../config/paths.js";
import {
  CreditsDirectoryService,
  looksLikeEmail,
  normalizeEmail,
  type DirectoryEntry,
} from "./directory.js";
import { buildInviteDeepLink } from "./deeplinks.js";

export type MoneyRequestStatus =
  "pending" | "accepted" | "paid" | "declined" | "cancelled" | "expired";

export type MoneyRequest = {
  readonly requestId: string;
  readonly requesterTenantId: string;
  readonly requesterEmail?: string;
  readonly requesterHandle?: string;
  /** Set when payer is already on the platform (or after invite claim). */
  payerTenantId?: string;
  /** Always set when requesting by email / for invites. */
  readonly payerEmail?: string;
  readonly payerHandle?: string;
  readonly amountCents: number;
  readonly note?: string;
  status: MoneyRequestStatus;
  /** Present when payer was not in the directory at create time. */
  readonly inviteTokenHash?: string;
  readonly inviteUrl?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly correlationId?: string;
  stagedTransferActionId?: string;
  paidTransferId?: string;
  updatedAt: string;
};

type RequestsFile = {
  version: 1;
  requests: Record<string, MoneyRequest>;
};

function emptyFile(): RequestsFile {
  return { version: 1, requests: {} };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function moneyRequestTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_CREDITS_REQUEST_TTL_SEC?.trim();
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return Math.floor(Number(raw));
  return 7 * 24 * 60 * 60; // 7 days
}

export const buildRequestInviteUrl = (
  requestId: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> => buildInviteDeepLink({ requestId, token }, env);

async function loadFile(env: NodeJS.ProcessEnv): Promise<RequestsFile> {
  try {
    const raw = await readFile(resolveMoneyRequestsPath(env), "utf8");
    const parsed = JSON.parse(raw) as RequestsFile;
    if (!parsed || typeof parsed !== "object" || !parsed.requests) return emptyFile();
    return { version: 1, requests: parsed.requests };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyFile();
    throw err;
  }
}

async function saveFile(file: RequestsFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveMoneyRequestsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

function touchExpired(req: MoneyRequest): MoneyRequest {
  if (req.status !== "pending" && req.status !== "accepted") return req;
  if (Date.parse(req.expiresAt) > Date.now()) return req;
  return { ...req, status: "expired", updatedAt: new Date().toISOString() };
}

/** Private IO helper backing {@link CreditsRequestsService}. */
async function getMoneyRequestImpl(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest | undefined> {
  const file = await loadFile(env);
  const raw = file.requests[requestId.trim()];
  if (!raw) return undefined;
  const req = touchExpired(raw);
  if (req !== raw) {
    file.requests[req.requestId] = req;
    await saveFile(file, env);
  }
  return req;
}

type ListMoneyRequestsOptions = {
  tenantId?: string;
  role?: "requester" | "payer" | "any";
  status?: MoneyRequestStatus;
};

/** Private IO helper backing {@link CreditsRequestsService}. */
async function listMoneyRequestsImpl(
  options: ListMoneyRequestsOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest[]> {
  const file = await loadFile(env);
  let dirty = false;
  const out: MoneyRequest[] = [];
  for (const [id, raw] of Object.entries(file.requests)) {
    const req = touchExpired(raw);
    if (req !== raw) {
      file.requests[id] = req;
      dirty = true;
    }
    out.push(req);
  }
  if (dirty) await saveFile(file, env);

  const tenantId = options.tenantId?.trim();
  const role = options.role ?? "any";
  return out
    .filter((r) => {
      if (options.status && r.status !== options.status) return false;
      if (!tenantId) return true;
      if (role === "requester") return r.requesterTenantId === tenantId;
      if (role === "payer") return r.payerTenantId === tenantId;
      return r.requesterTenantId === tenantId || r.payerTenantId === tenantId;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type CreateMoneyRequestInput = {
  requesterTenantId: string;
  /** Payee addressing: email, @username, or tenant id (same as pay --to). */
  to: string;
  amountCents: number;
  note?: string;
  correlationId?: string;
};

export type CreateMoneyRequestResult = {
  request: MoneyRequest;
  /** Cleartext invite token — only returned at create time (never stored). */
  inviteToken?: string;
  /** True when payer email is not yet on the platform. */
  invite: boolean;
};

/** Directory data resolved (via CreditsDirectoryService) before persisting a new request. */
type ResolvedRequestParties = {
  requester: DirectoryEntry | undefined;
  payerTenantId?: string;
  payerEmail?: string;
  payerHandle?: string;
  invite: boolean;
};

/**
 * Private IO helper backing {@link CreditsRequestsService.create}.
 * Directory resolution happens in the Effect layer; this only persists the record.
 */
async function persistNewMoneyRequest(
  input: CreateMoneyRequestInput,
  parties: ResolvedRequestParties,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreateMoneyRequestResult> {
  const requesterTenantId = input.requesterTenantId.trim();
  const { requester, payerTenantId, payerEmail, payerHandle, invite } = parties;

  const requestId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + moneyRequestTtlSec(env) * 1000).toISOString();

  let inviteToken: string | undefined;
  let inviteTokenHash: string | undefined;
  let inviteUrl: string | undefined;
  if (invite) {
    if (!payerEmail) throw new Error("Invite requires a payer email");
    inviteToken = randomBytes(24).toString("base64url");
    inviteTokenHash = hashToken(inviteToken);
    inviteUrl = Effect.runSync(buildRequestInviteUrl(requestId, inviteToken, env));
  }

  const request: MoneyRequest = {
    requestId,
    requesterTenantId,
    requesterEmail: requester?.email,
    requesterHandle: requester?.handle,
    payerTenantId,
    payerEmail,
    payerHandle,
    amountCents: Math.round(input.amountCents),
    note: input.note?.trim() || undefined,
    status: "pending",
    inviteTokenHash,
    inviteUrl,
    createdAt: now,
    expiresAt,
    correlationId: input.correlationId,
    updatedAt: now,
  };

  const file = await loadFile(env);
  file.requests[requestId] = request;
  await saveFile(file, env);

  return { request, inviteToken, invite };
}

/** Public view — never exposes inviteTokenHash. */
export function publicMoneyRequest(req: MoneyRequest): Omit<MoneyRequest, "inviteTokenHash"> & {
  invitePending: boolean;
} {
  const { inviteTokenHash: _, ...rest } = req;
  return {
    ...rest,
    invitePending: Boolean(req.inviteTokenHash) && !req.payerTenantId && req.status === "pending",
  };
}

export type ClaimMoneyRequestInviteInput = {
  requestId: string;
  token: string;
  tenantId: string;
  /** Defaults to request.payerEmail */
  email?: string;
  handle?: string;
  displayName?: string;
};

/**
 * Private IO helper backing {@link CreditsRequestsService.claimInvite}.
 * Loads + validates the invite before the directory claim happens in the layer.
 */
async function loadInviteForClaim(
  input: ClaimMoneyRequestInviteInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ req: MoneyRequest; email: string }> {
  const file = await loadFile(env);
  let req = file.requests[input.requestId.trim()];
  if (!req) throw new Error("Unknown request id");
  req = touchExpired(req);
  if (req.status === "expired") {
    file.requests[req.requestId] = req;
    await saveFile(file, env);
    throw new Error("Request expired");
  }
  if (req.status !== "pending") throw new Error(`Request is ${req.status}`);
  if (!req.inviteTokenHash) throw new Error("Request has no invite (payer already on platform)");
  if (!tokensEqual(hashToken(input.token.trim()), req.inviteTokenHash)) {
    throw new Error("Invalid invite token");
  }
  const email = input.email?.trim() || req.payerEmail;
  if (!email) throw new Error("Email required to claim invite");
  return { req, email };
}

/**
 * Private IO helper backing {@link CreditsRequestsService.claimInvite}.
 * Persists the claimed request after the directory identity was claimed in the layer.
 */
async function persistClaimedInvite(
  req: MoneyRequest,
  entry: DirectoryEntry,
  email: string,
  created: boolean,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ request: MoneyRequest; directoryCreated: boolean }> {
  const file = await loadFile(env);
  const updated: MoneyRequest = {
    requestId: req.requestId,
    requesterTenantId: req.requesterTenantId,
    requesterEmail: req.requesterEmail,
    requesterHandle: req.requesterHandle,
    payerTenantId: entry.tenantId,
    payerEmail: entry.email ?? normalizeEmail(email),
    payerHandle: entry.handle ?? req.payerHandle,
    amountCents: req.amountCents,
    note: req.note,
    status: "pending",
    createdAt: req.createdAt,
    expiresAt: req.expiresAt,
    correlationId: req.correlationId,
    updatedAt: new Date().toISOString(),
  };

  file.requests[updated.requestId] = updated;
  await saveFile(file, env);
  return { request: updated, directoryCreated: created };
}

/** Private IO helper backing {@link CreditsRequestsService.decline}. */
async function declineMoneyRequestImpl(
  input: { requestId: string; payerTenantId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest> {
  return updateAsPayer(input.requestId, input.payerTenantId, "declined", env);
}

/** Private IO helper backing {@link CreditsRequestsService.cancel}. */
async function cancelMoneyRequestImpl(
  input: { requestId: string; requesterTenantId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest> {
  const file = await loadFile(env);
  let req = file.requests[input.requestId.trim()];
  if (!req) throw new Error("Unknown request id");
  req = touchExpired(req);
  if (req.requesterTenantId !== input.requesterTenantId.trim()) {
    throw new Error("Only the requester can cancel this request");
  }
  if (req.status !== "pending" && req.status !== "accepted") {
    throw new Error(`Cannot cancel request in status ${req.status}`);
  }
  const updated: MoneyRequest = {
    ...req,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  };
  file.requests[updated.requestId] = updated;
  await saveFile(file, env);
  return updated;
}

async function updateAsPayer(
  requestId: string,
  payerTenantId: string,
  status: "declined",
  env: NodeJS.ProcessEnv
): Promise<MoneyRequest> {
  const file = await loadFile(env);
  let req = file.requests[requestId.trim()];
  if (!req) throw new Error("Unknown request id");
  req = touchExpired(req);
  if (req.status === "expired") {
    file.requests[req.requestId] = req;
    await saveFile(file, env);
    throw new Error("Request expired");
  }
  if (req.status !== "pending") throw new Error(`Request is ${req.status}`);
  if (!req.payerTenantId) {
    throw new Error(
      "Payer has not joined yet — claim the invite first: clawql payments credits request claim-invite …"
    );
  }
  if (req.payerTenantId !== payerTenantId.trim()) {
    throw new Error("Only the payer can decline this request");
  }
  const updated: MoneyRequest = {
    ...req,
    status,
    updatedAt: new Date().toISOString(),
  };
  file.requests[updated.requestId] = updated;
  await saveFile(file, env);
  return updated;
}

/** Private IO helper backing {@link CreditsRequestsService.markAccepted}. */
async function markMoneyRequestAcceptedImpl(
  input: {
    requestId: string;
    payerTenantId: string;
    stagedTransferActionId: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest> {
  const file = await loadFile(env);
  let req = file.requests[input.requestId.trim()];
  if (!req) throw new Error("Unknown request id");
  req = touchExpired(req);
  if (req.status === "expired") {
    file.requests[req.requestId] = req;
    await saveFile(file, env);
    throw new Error("Request expired");
  }
  if (req.status !== "pending") throw new Error(`Request is ${req.status}`);
  if (!req.payerTenantId) {
    throw new Error(
      "Payer has not joined yet — claim the invite first: clawql payments credits request claim-invite …"
    );
  }
  if (req.payerTenantId !== input.payerTenantId.trim()) {
    throw new Error("Only the payer can accept this request");
  }
  const updated: MoneyRequest = {
    ...req,
    status: "accepted",
    stagedTransferActionId: input.stagedTransferActionId,
    updatedAt: new Date().toISOString(),
  };
  file.requests[updated.requestId] = updated;
  await saveFile(file, env);
  return updated;
}

/** Private IO helper backing {@link CreditsRequestsService.markPaid}. */
async function markMoneyRequestPaidImpl(
  input: { requestId: string; transferId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<MoneyRequest | undefined> {
  const file = await loadFile(env);
  const req = file.requests[input.requestId.trim()];
  if (!req) return undefined;
  if (req.status === "paid") return req;
  const updated: MoneyRequest = {
    ...req,
    status: "paid",
    paidTransferId: input.transferId,
    updatedAt: new Date().toISOString(),
  };
  file.requests[updated.requestId] = updated;
  await saveFile(file, env);
  return updated;
}

/** Private IO helper backing {@link CreditsRequestsService.reset}. */
async function resetMoneyRequestsImpl(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await saveFile(emptyFile(), env);
}

export class RequestsError extends Data.TaggedError("RequestsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

type ClaimInviteInput = ClaimMoneyRequestInviteInput;
type DeclineInput = { requestId: string; payerTenantId: string };
type CancelInput = { requestId: string; requesterTenantId: string };
type MarkAcceptedInput = {
  requestId: string;
  payerTenantId: string;
  stagedTransferActionId: string;
};
type MarkPaidInput = { requestId: string; transferId: string };

/** Effect surface over money requests / invoices. */
export class CreditsRequestsService extends Context.Tag("clawql/CreditsRequestsService")<
  CreditsRequestsService,
  {
    readonly get: (requestId: string) => Effect.Effect<MoneyRequest | undefined, RequestsError>;
    readonly list: (
      options?: ListMoneyRequestsOptions
    ) => Effect.Effect<MoneyRequest[], RequestsError>;
    readonly create: (
      input: CreateMoneyRequestInput
    ) => Effect.Effect<CreateMoneyRequestResult, RequestsError>;
    readonly claimInvite: (
      input: ClaimInviteInput
    ) => Effect.Effect<{ request: MoneyRequest; directoryCreated: boolean }, RequestsError>;
    readonly decline: (input: DeclineInput) => Effect.Effect<MoneyRequest, RequestsError>;
    readonly cancel: (input: CancelInput) => Effect.Effect<MoneyRequest, RequestsError>;
    readonly markAccepted: (input: MarkAcceptedInput) => Effect.Effect<MoneyRequest, RequestsError>;
    readonly markPaid: (
      input: MarkPaidInput
    ) => Effect.Effect<MoneyRequest | undefined, RequestsError>;
    readonly reset: () => Effect.Effect<void, RequestsError>;
  }
>() {}

export function creditsRequestsLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsRequestsService, never, CreditsDirectoryService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof RequestsError
          ? cause
          : new RequestsError({ reason: cause instanceof Error ? cause.message : reason, cause }),
    });

  return Layer.effect(
    CreditsRequestsService,
    Effect.gen(function* () {
      const directory = yield* CreditsDirectoryService;
      const toRequestsError = (error: { reason: string; cause?: unknown }) =>
        new RequestsError({ reason: error.reason, cause: error.cause });

      const create = (input: CreateMoneyRequestInput) =>
        Effect.gen(function* () {
          const requesterTenantId = input.requesterTenantId.trim();
          if (!requesterTenantId) {
            return yield* Effect.fail(new RequestsError({ reason: "requesterTenantId required" }));
          }
          if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
            return yield* Effect.fail(new RequestsError({ reason: "amountCents must be > 0" }));
          }
          const to = input.to.trim();
          if (!to) {
            return yield* Effect.fail(
              new RequestsError({ reason: "Recipient required (--to email | @user | tenant)" })
            );
          }

          const requester = yield* directory
            .getTenant(requesterTenantId)
            .pipe(Effect.mapError(toRequestsError));

          let payerTenantId: string | undefined;
          let payerEmail: string | undefined;
          let payerHandle: string | undefined;
          let invite = false;

          if (looksLikeEmail(to)) {
            payerEmail = normalizeEmail(to);
            const resolved = yield* directory
              .resolveRecipient(to, { forceEmail: true })
              .pipe(Effect.either);
            if (resolved._tag === "Right") {
              payerTenantId = resolved.right.tenantId;
              payerHandle = resolved.right.handle;
            } else {
              invite = true;
            }
          } else {
            const resolved = yield* directory
              .resolveRecipient(to, { forceHandle: to.startsWith("@") })
              .pipe(Effect.mapError(toRequestsError));
            payerTenantId = resolved.tenantId;
            payerEmail = resolved.email;
            payerHandle = resolved.handle;
            if (!payerEmail && looksLikeEmail(to)) {
              payerEmail = normalizeEmail(to);
            }
          }

          if (payerTenantId && payerTenantId === requesterTenantId) {
            return yield* Effect.fail(
              new RequestsError({ reason: "Cannot request money from yourself" })
            );
          }

          return yield* run("Failed to create money request", () =>
            persistNewMoneyRequest(
              input,
              { requester, payerTenantId, payerEmail, payerHandle, invite },
              env
            )
          );
        });

      const claimInvite = (input: ClaimInviteInput) =>
        Effect.gen(function* () {
          const { req, email } = yield* run("Failed to load money request invite", () =>
            loadInviteForClaim(input, env)
          );
          const { entry, created } = yield* directory
            .claim({
              email,
              handle: input.handle,
              tenantId: input.tenantId.trim(),
              displayName: input.displayName,
            })
            .pipe(Effect.mapError(toRequestsError));
          return yield* run("Failed to claim money request invite", () =>
            persistClaimedInvite(req, entry, email, created, env)
          );
        });

      return CreditsRequestsService.of({
        get: (requestId) =>
          run("Failed to load money request", () => getMoneyRequestImpl(requestId, env)),
        list: (options) =>
          run("Failed to list money requests", () => listMoneyRequestsImpl(options ?? {}, env)),
        create,
        claimInvite,
        decline: (input) =>
          run("Failed to decline money request", () => declineMoneyRequestImpl(input, env)),
        cancel: (input) =>
          run("Failed to cancel money request", () => cancelMoneyRequestImpl(input, env)),
        markAccepted: (input) =>
          run("Failed to mark money request accepted", () =>
            markMoneyRequestAcceptedImpl(input, env)
          ),
        markPaid: (input) =>
          run("Failed to mark money request paid", () => markMoneyRequestPaidImpl(input, env)),
        reset: () => run("Failed to reset money requests", () => resetMoneyRequestsImpl(env)),
      });
    })
  );
}
