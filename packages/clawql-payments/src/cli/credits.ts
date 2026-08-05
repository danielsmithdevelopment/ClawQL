import { Effect } from "effect";
import { AchTopupService } from "../credits/ach-topup-service.js";
import { CreditsService, creditsTransferShouldStage } from "../credits/credits-service.js";
import {
  isAchTopupDryRun,
  isCreditsEnabled,
  isCreditsTransferTotpRequired,
} from "../credits/config.js";
import { enrollStepUpTotp, getStepUpEnrollment } from "../credits/step-up.js";
import {
  claimDirectory,
  getEmailEntry,
  getHandleEntry,
  listDirectory,
  maskEmail,
  releaseEmail,
  releaseHandle,
  resolveRecipient,
} from "../credits/directory.js";
import {
  acceptMoneyRequest,
  cancelMoneyRequest,
  claimMoneyRequestInvite,
  createMoneyRequest,
  declineMoneyRequest,
  getMoneyRequest,
  listMoneyRequests,
  publicMoneyRequest,
} from "../credits/requests.js";
import { formatActivityLine, getActivityFeed } from "../credits/activity.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { loadPaymentsConfig } from "../config/store.js";

export type PaymentsCreditsShowOptions = {
  tenantId?: string;
};

export type PaymentsCreditsBankLinkOptions = {
  customerId?: string;
  tenantId?: string;
  returnUrl?: string;
};

export type PaymentsCreditsTopupOptions = {
  customerId?: string;
  amountUsd?: number;
  paymentMethodId?: string;
  tenantId?: string;
};

export type PaymentsCreditsTransferOptions = {
  fromTenantId?: string;
  toTenantId?: string;
  /** @handle or bare handle — resolved via payments directory. */
  toHandle?: string;
  /**
   * Venmo-style payee: `@bob`, handle, or tenant id.
   * Prefer this for `pay`; `--to-tenant` remains explicit.
   */
  payTo?: string;
  amountUsd?: number;
  idempotencyKey?: string;
  correlationId?: string;
  note?: string;
  /** When set with actionId+code, confirm a staged transfer. */
  confirm?: boolean;
  actionId?: string;
  code?: string;
  totp?: string;
  /** Force immediate execute (also requires CLAWQL_CREDITS_TRANSFER_DIRECT=1). */
  direct?: boolean;
  json?: boolean;
};

export type PaymentsCreditsDirectoryOptions = {
  handle?: string;
  email?: string;
  tenantId?: string;
  displayName?: string;
  json?: boolean;
  /** Show full email in list (default masks local part). */
  showEmail?: boolean;
};

export type PaymentsCreditsStepUpOptions = {
  tenantId?: string;
  json?: boolean;
  showSecret?: boolean;
};

export async function runPaymentsCreditsShow(
  options: PaymentsCreditsShowOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const account = await runPaymentsEffect(
    Effect.gen(function* () {
      const credits = yield* CreditsService;
      return yield* credits.getBalance(tenantId);
    })
  );
  console.log(`Tenant: ${account.tenantId}`);
  console.log(`Balance: $${(account.balanceCents / 100).toFixed(2)} (${account.balanceCents}¢)`);
  console.log(`Updated: ${account.updatedAt}`);
  console.log(`Ledger entries: ${account.entries.length}`);
  for (const e of account.entries.slice(-10)) {
    console.log(
      `  ${e.ts} ${e.kind} ${e.deltaCents}¢ → ${e.balanceAfterCents}¢${e.paymentIntentId ? ` (${e.paymentIntentId})` : ""}`
    );
  }
  return 0;
}

export async function runPaymentsCreditsBankLink(
  options: PaymentsCreditsBankLinkOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const customerId = options.customerId?.trim() || config.stripe?.customerId?.trim();
  if (!customerId) {
    console.error(
      "Usage: clawql payments credits bank-link --customer cus_xxx  (or save customer via stripe customer create)"
    );
    return 1;
  }
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const session = await runPaymentsEffect(
    Effect.gen(function* () {
      const ach = yield* AchTopupService;
      return yield* ach.createBankLinkSession({
        customerId,
        tenantId,
        returnUrl: options.returnUrl,
      });
    })
  );
  console.log(`Financial Connections session: ${session.id}`);
  console.log(`client_secret: ${session.clientSecret}`);
  console.log(`customer: ${session.customerId}`);
  if (session.dryRun) {
    console.log("dry-run: set CLAWQL_ACH_TOPUP_DRY_RUN=0 for live Stripe FC sessions");
  } else {
    console.log(
      "Collect the bank account in Stripe.js / Link with this client_secret, then top up with the resulting pm_…"
    );
  }
  return 0;
}

export async function runPaymentsCreditsTopup(
  options: PaymentsCreditsTopupOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const customerId = options.customerId?.trim() || config.stripe?.customerId?.trim();
  const amountUsd = options.amountUsd;
  if (!customerId || amountUsd === undefined || !Number.isFinite(amountUsd)) {
    console.error(
      "Usage: clawql payments credits topup --customer cus_xxx --amount 25 [--payment-method pm_xxx]"
    );
    return 1;
  }
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  if (!isAchTopupDryRun() && !options.paymentMethodId?.trim()) {
    console.error("Live top-up requires --payment-method pm_xxx (from Financial Connections)");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const ach = yield* AchTopupService;
      return yield* ach.createTopup({
        customerId,
        amountUsd,
        paymentMethodId: options.paymentMethodId,
        tenantId,
      });
    })
  );
  console.log(`PaymentIntent: ${result.paymentIntentId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Amount: $${(result.amountCents / 100).toFixed(2)}`);
  if (result.settledImmediately) {
    console.log("Credits settled immediately (succeeded / dry-run).");
  } else {
    console.log("Credits settle on payment_intent.succeeded webhook (ACH may take days).");
  }
  return 0;
}

export async function runPaymentsCreditsTransfer(
  options: PaymentsCreditsTransferOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }

  // Confirm path
  if (options.confirm || options.actionId?.trim()) {
    const actionId = options.actionId?.trim();
    const code = options.code?.trim();
    if (!actionId || !code) {
      console.error(
        "Usage: clawql payments credits transfer --confirm --action-id UUID --code HEX [--totp NNNNNN]"
      );
      return 1;
    }
    try {
      const result = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.confirmTransfer({
            actionId,
            code,
            totp: options.totp,
          });
        })
      );
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
      }
      console.log(
        `Confirmed transfer $${(result.amountCents / 100).toFixed(2)} ${result.fromTenantId} → ${result.toTenantId}`
      );
      console.log(`Transfer id: ${result.transferId}`);
      return 0;
    } catch (err) {
      console.error(formatErr(err));
      return 1;
    }
  }

  const config = await loadPaymentsConfig();
  const fromTenantId = options.fromTenantId?.trim() || config.tenantId || "default";
  const amountUsd = options.amountUsd;

  let toTenantId = options.toTenantId?.trim();
  let resolvedHandle: string | undefined;
  let resolvedEmail: string | undefined;
  const payee = options.toHandle?.trim() || options.payTo?.trim();
  if (payee) {
    try {
      const resolved = await resolveRecipient(payee, process.env, {
        forceHandle: Boolean(options.toHandle?.trim()) || payee.startsWith("@"),
        forceEmail: payee.includes("@") && !payee.startsWith("@"),
      });
      toTenantId = resolved.tenantId;
      resolvedHandle = resolved.handle;
      resolvedEmail = resolved.email;
    } catch (err) {
      console.error(formatErr(err));
      return 1;
    }
  }

  if (!toTenantId || amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error(
      "Usage: clawql payments credits pay --to bob@acme.com --amount 10\n" +
        "       clawql payments credits pay --to @bob --amount 10\n" +
        "       clawql payments credits transfer --to-tenant <tenantId> --amount 10\n" +
        "       clawql payments credits transfer --confirm --action-id UUID --code HEX [--totp NNNNNN]"
    );
    return 1;
  }

  const amountCents = Math.round(amountUsd * 100);
  const shouldStage = creditsTransferShouldStage() && !options.direct;
  // Prefer privacy username when set; else email; else tenant id.
  const payeeLabel = resolvedHandle
    ? `@${resolvedHandle}`
    : resolvedEmail
      ? resolvedEmail
      : toTenantId;

  try {
    if (!shouldStage) {
      if (creditsTransferShouldStage() && options.direct) {
        console.error(
          "Direct transfer refused — set CLAWQL_CREDITS_TRANSFER_DIRECT=1 for break-glass execute (not recommended)"
        );
        return 1;
      }
      const result = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.transfer({
            fromTenantId,
            toTenantId,
            amountCents,
            idempotencyKey: options.idempotencyKey,
            correlationId: options.correlationId,
            note: options.note,
          });
        })
      );
      if (options.json) {
        console.log(
          JSON.stringify(
            { ...result, toHandle: resolvedHandle, toEmail: resolvedEmail },
            null,
            2
          )
        );
        return 0;
      }
      console.log(
        `Transferred $${(result.amountCents / 100).toFixed(2)} ${result.fromTenantId} → ${payeeLabel}`
      );
      console.log(`Transfer id: ${result.transferId}`);
      return 0;
    }

    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId,
          toTenantId,
          amountCents,
          idempotencyKey: options.idempotencyKey,
          correlationId: options.correlationId,
          note: options.note,
        });
      })
    );
    if (options.json) {
      console.log(
        JSON.stringify({ ...staged, toHandle: resolvedHandle, toEmail: resolvedEmail }, null, 2)
      );
      return 0;
    }
    console.log(
      `Staged transfer $${staged.amountUsd.toFixed(2)} ${staged.fromTenantId} → ${payeeLabel}`
    );
    console.log(`action_id: ${staged.actionId}`);
    console.log(`confirmation_code: ${staged.confirmationCode}`);
    console.log(`expires: ${staged.expiresAt}`);
    if (staged.totpRequired || isCreditsTransferTotpRequired()) {
      console.log("TOTP required on confirm (CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1)");
    }
    console.log(
      `Confirm: clawql payments credits transfer --confirm --action-id ${staged.actionId} --code ${staged.confirmationCode}${staged.totpRequired ? " --totp NNNNNN" : ""}`
    );
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsDirectoryClaim(
  options: PaymentsCreditsDirectoryOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const handle = options.handle?.trim();
  const email = options.email?.trim();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  if (!handle && !email) {
    console.error(
      "Usage: clawql payments credits directory claim --email you@acme.com [--handle alice] [--tenant-id …] [--name …]\n" +
        "       (email is the default payee; --handle is an optional privacy username)"
    );
    return 1;
  }
  try {
    const { entry, created } = await claimDirectory({
      email,
      handle,
      tenantId,
      displayName: options.displayName,
    });
    if (options.json) {
      console.log(JSON.stringify({ entry, created }, null, 2));
      return 0;
    }
    console.log(created ? "Directory profile created" : "Directory profile updated");
    console.log(`Tenant: ${entry.tenantId}`);
    if (entry.email) console.log(`Email (default): ${entry.email}`);
    if (entry.handle) console.log(`Username (privacy): @${entry.handle}`);
    else console.log("Username: (none — others pay you by email; set --handle for privacy)");
    if (entry.displayName) console.log(`Display name: ${entry.displayName}`);
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsDirectoryShow(
  options: PaymentsCreditsDirectoryOptions = {}
): Promise<number> {
  const handle = options.handle?.trim();
  const email = options.email?.trim();
  if (!handle && !email) {
    console.error(
      "Usage: clawql payments credits directory show --email you@acme.com | --handle @alice"
    );
    return 1;
  }
  try {
    const entry = email ? await getEmailEntry(email) : await getHandleEntry(handle!);
    if (!entry) {
      console.error(
        email ? `No directory entry for ${email}` : `No directory entry for @${handle!.replace(/^@+/, "")}`
      );
      return 1;
    }
    if (options.json) {
      console.log(JSON.stringify(entry, null, 2));
      return 0;
    }
    console.log(`Tenant: ${entry.tenantId}`);
    if (entry.email) console.log(`Email: ${entry.email}`);
    if (entry.handle) console.log(`Username: @${entry.handle}`);
    if (entry.displayName) console.log(`Display name: ${entry.displayName}`);
    console.log(`Claimed: ${entry.claimedAt}`);
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsDirectoryList(
  options: PaymentsCreditsDirectoryOptions = {}
): Promise<number> {
  const entries = await listDirectory();
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    console.log("No directory profiles yet.");
    return 0;
  }
  for (const e of entries) {
    const uname = e.handle ? `@${e.handle}` : "(no username)";
    const mail = e.email
      ? options.showEmail
        ? e.email
        : maskEmail(e.email)
      : "(no email)";
    console.log(
      `${uname.padEnd(16)} ${mail.padEnd(28)} ${e.tenantId}${e.displayName ? `  (${e.displayName})` : ""}`
    );
  }
  return 0;
}

export async function runPaymentsCreditsDirectoryRelease(
  options: PaymentsCreditsDirectoryOptions = {}
): Promise<number> {
  const handle = options.handle?.trim();
  const email = options.email?.trim();
  if (!handle && !email) {
    console.error(
      "Usage: clawql payments credits directory release --handle @alice | --email you@acme.com"
    );
    return 1;
  }
  try {
    if (email) {
      const ok = await releaseEmail(email);
      if (!ok) {
        console.error(`No directory entry for ${email}`);
        return 1;
      }
      console.log(`Released email ${email} (username kept if present)`);
      return 0;
    }
    const ok = await releaseHandle(handle!);
    if (!ok) {
      console.error(`No directory entry for ${handle}`);
      return 1;
    }
    console.log(`Released username ${handle!.startsWith("@") ? handle : `@${handle}`}`);
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

/** Alias: Venmo-style pay → same staging path as transfer. */
export async function runPaymentsCreditsPay(
  options: PaymentsCreditsTransferOptions = {}
): Promise<number> {
  return runPaymentsCreditsTransfer(options);
}

export async function runPaymentsCreditsStepUpEnroll(
  options: PaymentsCreditsStepUpOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  try {
    const result = await enrollStepUpTotp({ tenantId });
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            tenantId,
            created: result.created,
            enrolledAt: result.enrollment.enrolledAt,
            otpauthUrl: result.otpauthUrl,
            secretBase32: options.showSecret ? result.enrollment.secretBase32 : undefined,
          },
          null,
          2
        )
      );
      return 0;
    }
    console.log(
      result.created
        ? `Enrolled TOTP step-up for tenant ${tenantId}`
        : `TOTP step-up already enrolled for tenant ${tenantId}`
    );
    console.log(`otpauth: ${result.otpauthUrl}`);
    if (options.showSecret) {
      console.log(`secret: ${result.enrollment.secretBase32}`);
    } else {
      console.log("Pass --show-secrets once to print the base32 secret for authenticator apps.");
    }
    console.log("Enable gate: export CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1");
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsStepUpShow(
  options: PaymentsCreditsStepUpOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const enrollment = await getStepUpEnrollment(tenantId);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          tenantId,
          enrolled: Boolean(enrollment),
          enrolledAt: enrollment?.enrolledAt,
          totpRequired: isCreditsTransferTotpRequired(),
        },
        null,
        2
      )
    );
    return enrollment ? 0 : 1;
  }
  if (!enrollment) {
    console.log(`No TOTP step-up enrollment for ${tenantId}`);
    return 1;
  }
  console.log(`Tenant ${tenantId}: enrolled at ${enrollment.enrolledAt}`);
  console.log(
    `Transfer TOTP gate: ${isCreditsTransferTotpRequired() ? "ON" : "off (set CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1)"}`
  );
  return 0;
}

export type PaymentsCreditsActivityOptions = {
  tenantId?: string;
  limit?: number;
  filter?: "all" | "transfers" | "requests" | "money" | "ledger";
  json?: boolean;
};

export async function runPaymentsCreditsActivity(
  options: PaymentsCreditsActivityOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  try {
    const feed = await getActivityFeed({
      tenantId,
      limit: options.limit,
      filter: options.filter ?? "money",
    });
    if (options.json) {
      console.log(JSON.stringify(feed, null, 2));
      return 0;
    }
    console.log(
      `${feed.label ?? feed.tenantId}  balance $${(feed.balanceCents / 100).toFixed(2)}`
    );
    if (feed.items.length === 0) {
      console.log("No recent activity.");
      return 0;
    }
    for (const item of feed.items) {
      const day = item.ts.slice(0, 10);
      console.log(`${day}  ${formatActivityLine(item)}`);
    }
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export type PaymentsCreditsRequestOptions = {
  fromTenantId?: string;
  /** Requester tenant (alias of fromTenantId for request create). */
  tenantId?: string;
  payTo?: string;
  toHandle?: string;
  toTenantId?: string;
  amountUsd?: number;
  note?: string;
  correlationId?: string;
  requestId?: string;
  inviteToken?: string;
  handle?: string;
  email?: string;
  displayName?: string;
  role?: "requester" | "payer" | "any";
  status?: string;
  json?: boolean;
};

export async function runPaymentsCreditsRequestCreate(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }
  const config = await loadPaymentsConfig();
  const requesterTenantId =
    options.fromTenantId?.trim() || options.tenantId?.trim() || config.tenantId || "default";
  const to =
    options.payTo?.trim() ||
    options.toHandle?.trim() ||
    options.toTenantId?.trim() ||
    options.email?.trim();
  const amountUsd = options.amountUsd;
  if (!to || amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error(
      "Usage: clawql payments credits request --to newbie@acme.com|--to @bob --amount 25 [--note invoice]\n" +
        "       clawql payments credits invoice …  (alias)"
    );
    return 1;
  }
  try {
    const result = await createMoneyRequest({
      requesterTenantId,
      to,
      amountCents: Math.round(amountUsd * 100),
      note: options.note,
      correlationId: options.correlationId,
    });
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ...publicMoneyRequest(result.request),
            invite: result.invite,
            inviteToken: result.inviteToken,
          },
          null,
          2
        )
      );
      return 0;
    }
    const r = result.request;
    console.log(
      `Request ${r.requestId}: $${(r.amountCents / 100).toFixed(2)} from ${requesterTenantId} → ${
        r.payerHandle ? `@${r.payerHandle}` : r.payerEmail || r.payerTenantId || to
      }`
    );
    if (r.note) console.log(`Note: ${r.note}`);
    console.log(`Status: ${r.status} (expires ${r.expiresAt})`);
    if (result.invite) {
      console.log("Payer is not on ClawQL yet — share this invite:");
      console.log(`  ${r.inviteUrl}`);
      console.log(
        `  clawql payments credits request claim-invite --request-id ${r.requestId} --token ${result.inviteToken} --tenant-id <new> [--handle …]`
      );
    } else {
      console.log(
        `Payer accepts: clawql payments credits request accept --request-id ${r.requestId} --tenant-id ${r.payerTenantId}`
      );
    }
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

/** Alias for request create (invoice language). */
export async function runPaymentsCreditsInvoice(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestCreate(options);
}

export async function runPaymentsCreditsRequestList(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId;
  const role = options.role ?? "any";
  const status = options.status?.trim() as
    | "pending"
    | "accepted"
    | "paid"
    | "declined"
    | "cancelled"
    | "expired"
    | undefined;
  const rows = await listMoneyRequests({ tenantId, role, status });
  if (options.json) {
    console.log(JSON.stringify(rows.map(publicMoneyRequest), null, 2));
    return 0;
  }
  if (rows.length === 0) {
    console.log("No money requests.");
    return 0;
  }
  for (const r of rows) {
    const who = r.payerHandle
      ? `@${r.payerHandle}`
      : r.payerEmail || r.payerTenantId || "(invite)";
    console.log(
      `${r.requestId.slice(0, 8)}…  $${(r.amountCents / 100).toFixed(2).padStart(8)}  ${r.status.padEnd(10)}  ${r.requesterTenantId} ← ${who}${r.note ? `  (${r.note})` : ""}`
    );
  }
  return 0;
}

export async function runPaymentsCreditsRequestShow(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  const requestId = options.requestId?.trim();
  if (!requestId) {
    console.error("Usage: clawql payments credits request show --request-id UUID");
    return 1;
  }
  const req = await getMoneyRequest(requestId);
  if (!req) {
    console.error("Unknown request id");
    return 1;
  }
  if (options.json) {
    console.log(JSON.stringify(publicMoneyRequest(req), null, 2));
    return 0;
  }
  const pub = publicMoneyRequest(req);
  console.log(JSON.stringify(pub, null, 2));
  return 0;
}

export async function runPaymentsCreditsRequestClaimInvite(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  const requestId = options.requestId?.trim();
  const token = options.inviteToken?.trim();
  const tenantId = options.tenantId?.trim();
  if (!requestId || !token || !tenantId) {
    console.error(
      "Usage: clawql payments credits request claim-invite --request-id UUID --token TOKEN --tenant-id ID [--email …] [--handle …]"
    );
    return 1;
  }
  try {
    const { request, directoryCreated } = await claimMoneyRequestInvite({
      requestId,
      token,
      tenantId,
      email: options.email,
      handle: options.handle,
      displayName: options.displayName,
    });
    if (options.json) {
      console.log(JSON.stringify({ request: publicMoneyRequest(request), directoryCreated }, null, 2));
      return 0;
    }
    console.log(
      directoryCreated
        ? `Joined ClawQL as tenant ${tenantId} (directory created)`
        : `Linked invite to tenant ${tenantId}`
    );
    if (request.payerEmail) console.log(`Email: ${request.payerEmail}`);
    if (request.payerHandle) console.log(`Username: @${request.payerHandle}`);
    console.log(
      `Accept & pay: clawql payments credits request accept --request-id ${request.requestId} --tenant-id ${tenantId}`
    );
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsRequestAccept(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }
  const config = await loadPaymentsConfig();
  const requestId = options.requestId?.trim();
  const payerTenantId =
    options.tenantId?.trim() || options.fromTenantId?.trim() || config.tenantId || "default";
  if (!requestId) {
    console.error(
      "Usage: clawql payments credits request accept --request-id UUID [--tenant-id payer]"
    );
    return 1;
  }
  try {
    const { request, staged } = await acceptMoneyRequest(
      { requestId, payerTenantId },
      async (input) =>
        runPaymentsEffect(
          Effect.gen(function* () {
            const credits = yield* CreditsService;
            return yield* credits.stageTransfer({
              fromTenantId: input.fromTenantId,
              toTenantId: input.toTenantId,
              amountCents: input.amountCents,
              note: input.note,
              correlationId: input.correlationId,
              requestId: input.requestId,
            });
          })
        )
    );
    if (options.json) {
      console.log(JSON.stringify({ request: publicMoneyRequest(request), staged }, null, 2));
      return 0;
    }
    console.log(
      `Accepted request ${request.requestId} — staged $${staged.amountUsd.toFixed(2)} ${staged.fromTenantId} → ${staged.toTenantId}`
    );
    console.log(`action_id: ${staged.actionId}`);
    console.log(`confirmation_code: ${staged.confirmationCode}`);
    if (staged.totpRequired || isCreditsTransferTotpRequired()) {
      console.log("TOTP required on confirm");
    }
    console.log(
      `Confirm: clawql payments credits transfer --confirm --action-id ${staged.actionId} --code ${staged.confirmationCode}${staged.totpRequired ? " --totp NNNNNN" : ""}`
    );
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsRequestDecline(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const requestId = options.requestId?.trim();
  const payerTenantId =
    options.tenantId?.trim() || options.fromTenantId?.trim() || config.tenantId || "default";
  if (!requestId) {
    console.error("Usage: clawql payments credits request decline --request-id UUID");
    return 1;
  }
  try {
    const req = await declineMoneyRequest({ requestId, payerTenantId });
    if (options.json) {
      console.log(JSON.stringify(publicMoneyRequest(req), null, 2));
      return 0;
    }
    console.log(`Declined request ${req.requestId}`);
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsRequestCancel(
  options: PaymentsCreditsRequestOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const requestId = options.requestId?.trim();
  const requesterTenantId =
    options.tenantId?.trim() || options.fromTenantId?.trim() || config.tenantId || "default";
  if (!requestId) {
    console.error("Usage: clawql payments credits request cancel --request-id UUID");
    return 1;
  }
  try {
    const req = await cancelMoneyRequest({ requestId, requesterTenantId });
    if (options.json) {
      console.log(JSON.stringify(publicMoneyRequest(req), null, 2));
      return 0;
    }
    console.log(`Cancelled request ${req.requestId}`);
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

function formatErr(err: unknown): string {
  if (err && typeof err === "object" && "reason" in err) {
    return String((err as { reason: unknown }).reason);
  }
  return err instanceof Error ? err.message : String(err);
}
