/**
 * Activity feed — read model over credits ledger + money requests.
 * Venmo-style "recent" for a tenant (enrich counterparties via directory).
 */

import { Context, Data, Effect, Layer } from "effect";
import {
  CreditsLedgerService,
  getCreditAccount,
  type CreditLedgerEntry,
  type CreditLedgerKind,
} from "./ledger.js";
import {
  CreditsDirectoryService,
  getTenantEntry,
  maskEmail,
  type DirectoryEntry,
} from "./directory.js";
import {
  CreditsRequestsService,
  listMoneyRequests,
  publicMoneyRequest,
  type MoneyRequest,
  type MoneyRequestStatus,
} from "./requests.js";

export type ActivityKind =
  | "transfer_sent"
  | "transfer_received"
  | "topup"
  | "debit"
  | "hold"
  | "capture"
  | "release"
  | "adjust"
  | "request_out"
  | "request_in"
  | "other";

export type ActivityItem = {
  readonly id: string;
  readonly ts: string;
  readonly kind: ActivityKind;
  readonly amountCents: number;
  readonly balanceAfterCents?: number;
  readonly note?: string;
  readonly counterpartyTenantId?: string;
  /** Privacy-preferring label: @handle, else masked email, else tenant id. */
  readonly counterpartyLabel?: string;
  readonly transferId?: string;
  readonly requestId?: string;
  readonly requestStatus?: MoneyRequestStatus;
  readonly source: "ledger" | "request";
};

export type ActivityFeed = {
  readonly tenantId: string;
  readonly label?: string;
  readonly balanceCents: number;
  readonly items: ActivityItem[];
};

function directoryLabel(entry: DirectoryEntry | undefined, tenantId: string): string {
  if (entry?.handle) return `@${entry.handle}`;
  if (entry?.email) return maskEmail(entry.email);
  return tenantId;
}

function selfLabel(entry: DirectoryEntry | undefined, _tenantId: string): string | undefined {
  if (entry?.handle) return `@${entry.handle}`;
  if (entry?.email) return entry.email;
  return undefined;
}

function ledgerKindToActivity(kind: CreditLedgerKind): ActivityKind {
  switch (kind) {
    case "transfer_out":
      return "transfer_sent";
    case "transfer_in":
      return "transfer_received";
    case "topup_settled":
    case "topup_pending":
      return "topup";
    case "debit":
      return "debit";
    case "hold":
      return "hold";
    case "capture":
      return "capture";
    case "release":
      return "release";
    case "adjust":
    case "grant":
      return "adjust";
    case "topup_failed":
      return "other";
    default:
      return "other";
  }
}

function fromLedgerEntry(entry: CreditLedgerEntry, counterpartyLabel?: string): ActivityItem {
  return {
    id: `ledger:${entry.id}`,
    ts: entry.ts,
    kind: ledgerKindToActivity(entry.kind),
    amountCents: entry.deltaCents,
    balanceAfterCents: entry.balanceAfterCents,
    note: entry.note,
    counterpartyTenantId: entry.counterpartyTenantId,
    counterpartyLabel,
    transferId: entry.transferId,
    source: "ledger",
  };
}

function fromRequest(req: MoneyRequest, viewerTenantId: string): ActivityItem {
  const outgoing = req.requesterTenantId === viewerTenantId;
  const counterpartyTenantId = outgoing ? req.payerTenantId : req.requesterTenantId;
  const counterpartyLabel = outgoing
    ? req.payerHandle
      ? `@${req.payerHandle}`
      : req.payerEmail
        ? maskEmail(req.payerEmail)
        : req.payerTenantId || "(invite)"
    : req.requesterHandle
      ? `@${req.requesterHandle}`
      : req.requesterEmail
        ? maskEmail(req.requesterEmail)
        : req.requesterTenantId;

  return {
    id: `request:${req.requestId}`,
    ts: req.updatedAt || req.createdAt,
    kind: outgoing ? "request_out" : "request_in",
    amountCents: outgoing ? req.amountCents : req.amountCents, // display absolute; sign via kind
    note: req.note,
    counterpartyTenantId,
    counterpartyLabel,
    requestId: req.requestId,
    requestStatus: req.status,
    transferId: req.paidTransferId,
    source: "request",
  };
}

export type GetActivityFeedOptions = {
  tenantId: string;
  /** Max items (default 25, max 100). */
  limit?: number;
  /** Filter: all | transfers | requests | money (transfers+requests) | ledger */
  filter?: "all" | "transfers" | "requests" | "money" | "ledger";
};

/**
 * Build a recent activity feed for a tenant.
 * Dedupes paid requests that already appear as transfer ledger legs (prefer ledger).
 * @deprecated Promise façade — prefer CreditsActivityService / Effect APIs. Forced edge only.
 */
export async function getActivityFeed(
  options: GetActivityFeedOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<ActivityFeed> {
  const tenantId = options.tenantId.trim();
  if (!tenantId) throw new Error("tenantId required");

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const filter = options.filter ?? "money";

  const [account, selfDir, requests] = await Promise.all([
    getCreditAccount(tenantId, env),
    getTenantEntry(tenantId, env),
    filter === "ledger"
      ? Promise.resolve([] as MoneyRequest[])
      : listMoneyRequests({ tenantId, role: "any" }, env),
  ]);

  const counterpartyIds = new Set<string>();
  for (const e of account.entries) {
    if (e.counterpartyTenantId) counterpartyIds.add(e.counterpartyTenantId);
  }
  for (const r of requests) {
    if (r.requesterTenantId !== tenantId) counterpartyIds.add(r.requesterTenantId);
    if (r.payerTenantId && r.payerTenantId !== tenantId) counterpartyIds.add(r.payerTenantId);
  }

  const labels = new Map<string, string>();
  await Promise.all(
    [...counterpartyIds].map(async (id) => {
      const entry = await getTenantEntry(id, env);
      labels.set(id, directoryLabel(entry, id));
    })
  );

  const includeLedger =
    filter === "all" || filter === "ledger" || filter === "money" || filter === "transfers";
  const includeRequests = filter === "all" || filter === "requests" || filter === "money";

  const items: ActivityItem[] = [];

  if (includeLedger) {
    for (const entry of account.entries) {
      if (filter === "transfers" && entry.kind !== "transfer_out" && entry.kind !== "transfer_in") {
        continue;
      }
      const cp = entry.counterpartyTenantId ? labels.get(entry.counterpartyTenantId) : undefined;
      items.push(fromLedgerEntry(entry, cp));
    }
  }

  const paidTransferIds = new Set(
    account.entries.filter((e) => e.transferId).map((e) => e.transferId!)
  );

  if (includeRequests) {
    for (const req of requests) {
      // Prefer ledger legs once paid (avoid double-counting).
      if (req.status === "paid" && req.paidTransferId && paidTransferIds.has(req.paidTransferId)) {
        continue;
      }
      items.push(fromRequest(req, tenantId));
    }
  }

  items.sort((a, b) => b.ts.localeCompare(a.ts));

  return {
    tenantId,
    label: selfLabel(selfDir, tenantId),
    balanceCents: account.balanceCents,
    items: items.slice(0, limit),
  };
}

/** Human-readable one-liner for CLI. */
export function formatActivityLine(item: ActivityItem): string {
  const usd = (Math.abs(item.amountCents) / 100).toFixed(2);
  const who = item.counterpartyLabel ?? item.counterpartyTenantId ?? "";
  switch (item.kind) {
    case "transfer_sent":
      return `sent     $${usd} → ${who}${item.note ? `  (${item.note})` : ""}`;
    case "transfer_received":
      return `received $${usd} ← ${who}${item.note ? `  (${item.note})` : ""}`;
    case "request_out":
      return `request  $${usd} → ${who}  [${item.requestStatus}]${item.note ? `  (${item.note})` : ""}`;
    case "request_in":
      return `request  $${usd} ← ${who}  [${item.requestStatus}]${item.note ? `  (${item.note})` : ""}`;
    case "topup":
      return `topup    $${usd}${item.note ? `  (${item.note})` : ""}`;
    case "debit":
      return `debit    $${usd}${item.note ? `  (${item.note})` : ""}`;
    default:
      return `${item.kind.padEnd(8)} $${usd}${who ? `  ${who}` : ""}${item.note ? `  (${item.note})` : ""}`;
  }
}

/** Re-export for MCP JSON without invite hashes. */
export { publicMoneyRequest };

export class ActivityError extends Data.TaggedError("ActivityError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Effect surface over the activity read model (ledger + money requests, directory-enriched). */
export class CreditsActivityService extends Context.Tag("clawql/CreditsActivityService")<
  CreditsActivityService,
  {
    readonly getFeed: (
      options: GetActivityFeedOptions
    ) => Effect.Effect<ActivityFeed, ActivityError>;
  }
>() {}

export function creditsActivityLiveLayer(): Layer.Layer<
  CreditsActivityService,
  never,
  CreditsLedgerService | CreditsDirectoryService | CreditsRequestsService
> {
  return Layer.effect(
    CreditsActivityService,
    Effect.gen(function* () {
      const ledger = yield* CreditsLedgerService;
      const directory = yield* CreditsDirectoryService;
      const requestsSvc = yield* CreditsRequestsService;

      const toActivityError = (cause: { reason: string; cause?: unknown }) =>
        new ActivityError({ reason: cause.reason, cause: cause.cause });

      const getFeed = (options: GetActivityFeedOptions) =>
        Effect.gen(function* () {
          const tenantId = options.tenantId.trim();
          if (!tenantId) {
            return yield* Effect.fail(new ActivityError({ reason: "tenantId required" }));
          }

          const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
          const filter = options.filter ?? "money";

          const account = yield* ledger.getAccount(tenantId).pipe(Effect.mapError(toActivityError));
          const selfDir = yield* directory
            .getTenant(tenantId)
            .pipe(Effect.mapError(toActivityError));
          const requests =
            filter === "ledger"
              ? ([] as MoneyRequest[])
              : yield* requestsSvc
                  .list({ tenantId, role: "any" })
                  .pipe(Effect.mapError(toActivityError));

          const counterpartyIds = new Set<string>();
          for (const e of account.entries) {
            if (e.counterpartyTenantId) counterpartyIds.add(e.counterpartyTenantId);
          }
          for (const r of requests) {
            if (r.requesterTenantId !== tenantId) counterpartyIds.add(r.requesterTenantId);
            if (r.payerTenantId && r.payerTenantId !== tenantId)
              counterpartyIds.add(r.payerTenantId);
          }

          const labels = new Map<string, string>();
          yield* Effect.forEach(
            [...counterpartyIds],
            (id) =>
              directory.getTenant(id).pipe(
                Effect.mapError(toActivityError),
                Effect.map((entry) => {
                  labels.set(id, directoryLabel(entry, id));
                })
              ),
            { concurrency: "unbounded", discard: true }
          );

          const includeLedger =
            filter === "all" || filter === "ledger" || filter === "money" || filter === "transfers";
          const includeRequests = filter === "all" || filter === "requests" || filter === "money";

          const items: ActivityItem[] = [];

          if (includeLedger) {
            for (const entry of account.entries) {
              if (
                filter === "transfers" &&
                entry.kind !== "transfer_out" &&
                entry.kind !== "transfer_in"
              ) {
                continue;
              }
              const cp = entry.counterpartyTenantId
                ? labels.get(entry.counterpartyTenantId)
                : undefined;
              items.push(fromLedgerEntry(entry, cp));
            }
          }

          const paidTransferIds = new Set(
            account.entries.filter((e) => e.transferId).map((e) => e.transferId!)
          );

          if (includeRequests) {
            for (const req of requests) {
              if (
                req.status === "paid" &&
                req.paidTransferId &&
                paidTransferIds.has(req.paidTransferId)
              ) {
                continue;
              }
              items.push(fromRequest(req, tenantId));
            }
          }

          items.sort((a, b) => b.ts.localeCompare(a.ts));

          return {
            tenantId,
            label: selfLabel(selfDir, tenantId),
            balanceCents: account.balanceCents,
            items: items.slice(0, limit),
          } satisfies ActivityFeed;
        });

      return CreditsActivityService.of({ getFeed });
    })
  );
}
