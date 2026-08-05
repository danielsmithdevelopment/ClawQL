/**
 * `clawql payments` — thin wrapper over clawql-payments.
 */

import {
  runPaymentsAudit,
  runPaymentsAuditVerify,
  runPaymentsPlanShow,
  runPaymentsPlanUpgrade,
  runPaymentsSpendReport,
  runPaymentsStripeCustomerCreate,
  runPaymentsStripeInvoiceCreate,
  runPaymentsStripeSetup,
  runPaymentsStripeSubscriptionCreate,
  runPaymentsStripeWebhookListen,
  runPaymentsStripeWebhookVerify,
  runPaymentsStripeMeterReport,
  runPaymentsUsageReport,
  runPaymentsX402Gate,
  runPaymentsX402GateList,
  runPaymentsX402Reconcile,
  runPaymentsX402Verify,
  runPaymentsX402WalletSetup,
  runPaymentsPayoutConnectCreate,
  runPaymentsPayoutConnectLink,
  runPaymentsPayoutCreate,
  runPaymentsPayoutPrefer,
  runPaymentsRampFundCreate,
  runPaymentsRampCardIssue,
  runPaymentsRampAgentCardIssue,
  runPaymentsOfframpSession,
  runPaymentsOfframpWebhook,
  runPaymentsCreditsShow,
  runPaymentsCreditsBankLink,
  runPaymentsCreditsTopup,
  runPaymentsCreditsTransfer,
  runPaymentsCreditsPay,
  runPaymentsCreditsActivity,
  runPaymentsCreditsDirectoryClaim,
  runPaymentsCreditsDirectoryShow,
  runPaymentsCreditsDirectoryList,
  runPaymentsCreditsDirectoryRelease,
  runPaymentsCreditsContactsAdd,
  runPaymentsCreditsContactsList,
  runPaymentsCreditsContactsRemove,
  runPaymentsCreditsContactsShow,
  runPaymentsCreditsRequestCreate,
  runPaymentsCreditsInvoice,
  runPaymentsCreditsRequestList,
  runPaymentsCreditsRequestShow,
  runPaymentsCreditsRequestClaimInvite,
  runPaymentsCreditsRequestAccept,
  runPaymentsCreditsRequestDecline,
  runPaymentsCreditsRequestCancel,
  runPaymentsCreditsRequestSendInvite,
  runPaymentsCreditsLink,
  runPaymentsCreditsQr,
  runPaymentsCreditsStepUpEnroll,
  runPaymentsCreditsStepUpShow,
  runPaymentsCompensationBalance,
  runPaymentsCompensationDeposit,
  runPaymentsCompensationCashout,
  runPaymentsCompensationApprove,
  runPaymentsCompensationConfirm,
  runPaymentsCompensationCancel,
  runPaymentsOrgAllocate,
  runPaymentsOrgCreate,
  runPaymentsOrgDistribute,
  runPaymentsOrgInvite,
  runPaymentsOrgMembers,
  runPaymentsOrgRemove,
  runPaymentsOrgShow,
  runPaymentsOrgSpend,
  runPaymentsOrgSso,
  runPaymentsOrgSuspend,
  runPaymentsAccountingExport,
  runPaymentsTaxEvidence,
  runPaymentsTaxProfileSet,
  runPaymentsTaxProfileShow,
  type SpendGroupBy,
  type PayoutMethod,
  type OffRampProvider,
  type CompensationReason,
  type AccountingExportFormat,
} from "clawql-payments";

export type PaymentsCliOptions = {
  tier?: string;
  month?: string;
  groupBy?: SpendGroupBy;
  correlationId?: string;
  limit?: number;
  activityFilter?: "all" | "transfers" | "requests" | "money" | "ledger";
  json?: boolean;
  dateFrom?: string;
  dateTo?: string;
  format?: string;
  output?: string;
  skipVerify?: boolean;
  taxYear?: number;
  partyId?: string;
  taxForm?: string;
  collected?: boolean;
  taxProfileRef?: string;
  toTenantId?: string;
  fromTenantId?: string;
  /** Payments directory handle (@alice). */
  handle?: string;
  toHandle?: string;
  /** Directory email (pay-by-email); may share --email with Stripe when in directory cmds. */
  directoryEmail?: string;
  /** Venmo-style payee from context-aware --to */
  payTo?: string;
  displayName?: string;
  requestId?: string;
  inviteToken?: string;
  requestRole?: "requester" | "payer" | "any";
  requestStatus?: string;
  idempotencyKey?: string;
  note?: string;
  totp?: string;
  direct?: boolean;
  email?: string;
  name?: string;
  customer?: string;
  plan?: string;
  amount?: number;
  address?: string;
  asset?: "USDC";
  resource?: string;
  tool?: string;
  price?: number;
  txHash?: string;
  signature?: string;
  payer?: string;
  date?: string;
  tenantId?: string;
  accountId?: string;
  publishableKey?: string;
  webhookSecret?: string;
  facilitatorUrl?: string;
  payloadPath?: string;
  process?: boolean;
  eventName?: string;
  identifier?: string;
  value?: number;
  destination?: PayoutMethod;
  creatorId?: string;
  wallet?: string;
  method?: PayoutMethod;
  country?: string;
  returnUrl?: string;
  refreshUrl?: string;
  userId?: string;
  agentId?: string;
  showSecrets?: boolean;
  vendorIds?: string[];
  interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
  provider?: OffRampProvider;
  paymentMethodId?: string;
  actionId?: string;
  code?: string;
  reason?: CompensationReason;
  recruitmentId?: string;
  source?: "credits" | "funds";
  assetKind?: "credits" | "funds";
  confirm?: boolean;
  /** Parse an existing credits deep link / clawql:// URI. */
  parseDeepLink?: string;
  /** Output path for QR SVG (`credits qr --out`). */
  out?: string;
  /** Directory phone (E.164). */
  phone?: string;
  /** IdP/operator phone verified assertion. */
  phoneVerified?: boolean;
  contactId?: string;
  label?: string;
  /** Send invite email on request create / send-invite. */
  sendEmail?: boolean;
  /** Force invite email dry-run preview. */
  emailDryRun?: boolean;
  /** Enterprise org id (`clawql payments org …`). */
  orgId?: string;
  /** Billing admin / actor tenant for org admin commands. */
  actorTenantId?: string;
  /** Target member tenant for allocate/suspend/remove. */
  memberTenantId?: string;
  /** Comma-separated company email domains for SSO. */
  domains?: string;
  /** Allocation role (intern|employee|senior|…). */
  allocationRoleId?: string;
  prometheus?: boolean;
  includeWorm?: boolean;
};

export async function runPaymentsPlanShowCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsPlanShow({ json: options.json });
}

export async function runPaymentsPlanUpgradeCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsPlanUpgrade({
    tier: options.tier,
    tenantId: options.tenantId,
    json: options.json,
  });
}

export async function runPaymentsUsageReportCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsUsageReport({ month: options.month, json: options.json });
}

export async function runPaymentsSpendReportCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsSpendReport({ groupBy: options.groupBy, json: options.json });
}

export async function runPaymentsAuditCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsAudit({
    correlationId: options.correlationId,
    limit: options.limit,
    json: options.json,
  });
}

export async function runPaymentsAuditVerifyCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsAuditVerify({ json: options.json });
}

export async function runPaymentsStripeSetupCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsStripeSetup({
    accountId: options.accountId,
    publishableKey: options.publishableKey,
    webhookSecret: options.webhookSecret,
    json: options.json,
  });
}

export async function runPaymentsStripeCustomerCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsStripeCustomerCreate({
    email: options.email,
    name: options.name,
    json: options.json,
  });
}

export async function runPaymentsStripeSubscriptionCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsStripeSubscriptionCreate({
    customer: options.customer,
    plan: options.plan,
    json: options.json,
  });
}

export async function runPaymentsStripeInvoiceCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsStripeInvoiceCreate({
    customer: options.customer,
    amount: options.amount,
    json: options.json,
  });
}

export async function runPaymentsStripeWebhookListenCmd(): Promise<number> {
  return runPaymentsStripeWebhookListen();
}

export async function runPaymentsStripeWebhookVerifyCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsStripeWebhookVerify({
    payloadPath: options.payloadPath,
    signature: options.signature,
    webhookSecret: options.webhookSecret,
    process: options.process,
    tenantId: options.tenantId,
    correlationId: options.correlationId,
    json: options.json,
  });
}

export async function runPaymentsStripeMeterReportCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsStripeMeterReport({
    value: options.value,
    customer: options.customer,
    eventName: options.eventName,
    identifier: options.identifier,
    tenantId: options.tenantId,
    correlationId: options.correlationId,
    json: options.json,
  });
}

export async function runPaymentsX402WalletSetupCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsX402WalletSetup({
    address: options.address,
    facilitatorUrl: options.facilitatorUrl,
    asset: options.asset,
    json: options.json,
  });
}

export async function runPaymentsX402GateCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsX402Gate({
    resource: options.resource,
    tool: options.tool,
    price: options.price,
    asset: options.asset,
    json: options.json,
  });
}

export async function runPaymentsX402VerifyCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsX402Verify({
    txHash: options.txHash,
    signature: options.signature,
    payer: options.payer,
    amount: options.amount,
    resource: options.resource,
    payloadPath: options.payloadPath,
    json: options.json,
  });
}

export async function runPaymentsX402ReconcileCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsX402Reconcile({
    date: options.date,
    resource: options.resource,
    amount: options.amount,
    txHash: options.txHash,
    tenantId: options.tenantId,
    correlationId: options.correlationId,
    json: options.json,
  });
}

export async function runPaymentsX402GateListCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsX402GateList({ json: options.json });
}

export async function runPaymentsPayoutConnectCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsPayoutConnectCreate({
    email: options.email,
    country: options.country,
    creatorId: options.creatorId,
    tenantId: options.tenantId,
    json: options.json,
  });
}

export async function runPaymentsPayoutConnectLinkCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsPayoutConnectLink({
    accountId: options.accountId,
    returnUrl: options.returnUrl,
    refreshUrl: options.refreshUrl,
    json: options.json,
  });
}

export async function runPaymentsPayoutCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsPayoutCreate({
    amountUsd: options.amount,
    destination: options.destination,
    accountId: options.accountId,
    wallet: options.wallet,
    creatorId: options.creatorId,
    tenantId: options.tenantId,
    json: options.json,
  });
}

export async function runPaymentsPayoutPreferCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsPayoutPrefer({
    creatorId: options.creatorId,
    method: options.method,
    accountId: options.accountId,
    wallet: options.wallet,
    email: options.email,
    json: options.json,
  });
}

export async function runPaymentsRampFundCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsRampFundCreate({
    name: options.name,
    limitUsd: options.limit ?? options.amount,
    interval: options.interval,
    tenantId: options.tenantId,
    json: options.json,
  });
}

export async function runPaymentsRampCardIssueCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsRampCardIssue({
    userId: options.userId,
    name: options.name,
    limitUsd: options.limit ?? options.amount,
    interval: options.interval,
    tenantId: options.tenantId,
    agentId: options.agentId,
    showSecrets: options.showSecrets,
    json: options.json,
  });
}

export async function runPaymentsRampAgentCardIssueCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsRampAgentCardIssue({
    userId: options.userId,
    amountUsd: options.amount ?? options.limit,
    name: options.name,
    vendorIds: options.vendorIds,
    tenantId: options.tenantId,
    agentId: options.agentId,
    showSecrets: options.showSecrets,
    json: options.json,
  });
}

export async function runPaymentsOfframpSessionCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsOfframpSession({
    amountUsd: options.amount,
    wallet: options.wallet,
    provider: options.provider,
    email: options.email,
    returnUrl: options.returnUrl,
    tenantId: options.tenantId,
    creatorId: options.creatorId,
    json: options.json,
  });
}

export async function runPaymentsOfframpWebhookCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsOfframpWebhook({
    provider: options.provider,
    payloadPath: options.payloadPath,
    signature: options.signature,
    tenantId: options.tenantId,
    process: options.process,
    json: options.json,
  });
}

export async function runPaymentsCreditsShowCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsCreditsShow({ tenantId: options.tenantId });
}

export async function runPaymentsCreditsBankLinkCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsBankLink({
    customerId: options.customer,
    tenantId: options.tenantId,
    returnUrl: options.returnUrl,
  });
}

export async function runPaymentsCreditsTopupCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsTopup({
    customerId: options.customer,
    amountUsd: options.amount,
    paymentMethodId: options.paymentMethodId,
    tenantId: options.tenantId,
  });
}

export async function runPaymentsCreditsTransferCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsTransfer({
    fromTenantId: options.fromTenantId ?? options.tenantId,
    toTenantId: options.toTenantId,
    toHandle: options.toHandle ?? options.handle,
    payTo: options.payTo,
    amountUsd: options.amount,
    idempotencyKey: options.idempotencyKey,
    correlationId: options.correlationId,
    note: options.note,
    confirm: options.confirm,
    actionId: options.actionId,
    code: options.code,
    totp: options.totp,
    direct: options.direct,
    json: options.json,
  });
}

export async function runPaymentsCreditsPayCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsCreditsPay({
    fromTenantId: options.fromTenantId ?? options.tenantId,
    toTenantId: options.toTenantId,
    toHandle: options.toHandle ?? options.handle,
    payTo: options.payTo,
    amountUsd: options.amount,
    idempotencyKey: options.idempotencyKey,
    correlationId: options.correlationId,
    note: options.note,
    confirm: options.confirm,
    actionId: options.actionId,
    code: options.code,
    totp: options.totp,
    direct: options.direct,
    json: options.json,
  });
}

export async function runPaymentsCreditsActivityCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsActivity({
    tenantId: options.tenantId ?? options.fromTenantId,
    limit: options.limit,
    filter: options.activityFilter,
    json: options.json,
  });
}

export async function runPaymentsCreditsLinkCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsCreditsLink({
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    amountUsd: options.amount,
    note: options.note,
    fromTenantId: options.fromTenantId ?? options.tenantId,
    requestId: options.requestId,
    parse: options.parseDeepLink,
    json: options.json,
  });
}

export async function runPaymentsCreditsQrCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsCreditsQr({
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    amountUsd: options.amount,
    note: options.note,
    fromTenantId: options.fromTenantId ?? options.tenantId,
    out: options.out ?? options.output,
    json: options.json,
  });
}

export async function runPaymentsCreditsDirectoryClaimCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsDirectoryClaim({
    handle: options.handle ?? options.toHandle,
    email: options.directoryEmail ?? options.email,
    phone: options.phone,
    phoneVerified: options.phoneVerified,
    tenantId: options.tenantId ?? options.fromTenantId,
    displayName: options.displayName ?? options.name,
    json: options.json,
  });
}

export async function runPaymentsCreditsDirectoryShowCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsDirectoryShow({
    handle: options.handle ?? options.toHandle,
    email: options.directoryEmail ?? options.email,
    phone: options.phone,
    json: options.json,
  });
}

export async function runPaymentsCreditsDirectoryListCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsDirectoryList({
    json: options.json,
    showEmail: options.showSecrets,
  });
}

export async function runPaymentsCreditsDirectoryReleaseCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsDirectoryRelease({
    handle: options.handle ?? options.toHandle,
    email: options.directoryEmail ?? options.email,
    phone: options.phone,
    json: options.json,
  });
}

export async function runPaymentsCreditsContactsAddCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsContactsAdd({
    tenantId: options.tenantId ?? options.fromTenantId,
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    label: options.label,
    json: options.json,
  });
}

export async function runPaymentsCreditsContactsListCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsContactsList({
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
    showSecrets: options.showSecrets,
  });
}

export async function runPaymentsCreditsContactsRemoveCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsContactsRemove({
    tenantId: options.tenantId ?? options.fromTenantId,
    contactId: options.contactId,
    json: options.json,
  });
}

export async function runPaymentsCreditsContactsShowCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsContactsShow({
    tenantId: options.tenantId ?? options.fromTenantId,
    contactId: options.contactId,
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestCreateCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestCreate({
    fromTenantId: options.fromTenantId,
    tenantId: options.tenantId,
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    toTenantId: options.toTenantId,
    email: options.directoryEmail ?? options.email,
    amountUsd: options.amount,
    note: options.note,
    correlationId: options.correlationId,
    sendEmail: options.sendEmail,
    emailDryRun: options.emailDryRun,
    json: options.json,
  });
}

export async function runPaymentsCreditsInvoiceCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsInvoice({
    fromTenantId: options.fromTenantId,
    tenantId: options.tenantId,
    payTo: options.payTo,
    toHandle: options.toHandle ?? options.handle,
    toTenantId: options.toTenantId,
    email: options.directoryEmail ?? options.email,
    amountUsd: options.amount,
    note: options.note,
    correlationId: options.correlationId,
    sendEmail: options.sendEmail,
    emailDryRun: options.emailDryRun,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestListCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestList({
    tenantId: options.tenantId ?? options.fromTenantId,
    role: options.requestRole,
    status: options.requestStatus,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestShowCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestShow({
    requestId: options.requestId,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestClaimInviteCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestClaimInvite({
    requestId: options.requestId,
    inviteToken: options.inviteToken,
    tenantId: options.tenantId,
    email: options.directoryEmail ?? options.email,
    handle: options.handle ?? options.toHandle,
    displayName: options.displayName ?? options.name,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestAcceptCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestAccept({
    requestId: options.requestId,
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestDeclineCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestDecline({
    requestId: options.requestId,
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestCancelCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestCancel({
    requestId: options.requestId,
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
  });
}

export async function runPaymentsCreditsRequestSendInviteCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsRequestSendInvite({
    requestId: options.requestId,
    inviteToken: options.inviteToken,
    email: options.directoryEmail ?? options.email,
    emailDryRun: options.emailDryRun,
    json: options.json,
  });
}

export async function runPaymentsCreditsStepUpEnrollCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsStepUpEnroll({
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
    showSecret: options.showSecrets,
  });
}

export async function runPaymentsCreditsStepUpShowCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCreditsStepUpShow({
    tenantId: options.tenantId ?? options.fromTenantId,
    json: options.json,
  });
}

export async function runPaymentsCompensationBalanceCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationBalance({
    agentId: options.agentId,
    json: options.json,
  });
}

export async function runPaymentsCompensationDepositCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationDeposit({
    agentId: options.agentId,
    amountUsd: options.amount,
    asset: options.assetKind,
    reason: options.reason,
    recruitmentId: options.recruitmentId,
    tenantId: options.tenantId,
    correlationId: options.correlationId,
    confirm: options.confirm,
    json: options.json,
  });
}

export async function runPaymentsCompensationCashoutCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationCashout({
    agentId: options.agentId,
    amountUsd: options.amount,
    source: options.source,
    destination: options.destination,
    account: options.accountId,
    wallet: options.wallet,
    tenantId: options.tenantId,
    confirm: options.confirm,
    json: options.json,
  });
}

export async function runPaymentsCompensationApproveCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationApprove({
    actionId: options.actionId,
    code: options.code,
    json: options.json,
  });
}

export async function runPaymentsCompensationConfirmCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationConfirm({
    actionId: options.actionId,
    code: options.code,
    json: options.json,
  });
}

export async function runPaymentsCompensationCancelCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsCompensationCancel({
    actionId: options.actionId,
    code: options.code,
    json: options.json,
  });
}

function asAccountingFormat(format?: string): AccountingExportFormat | undefined {
  if (format === "csv" || format === "json" || format === "qb-csv" || format === "xero-csv") {
    return format;
  }
  return undefined;
}

export async function runPaymentsAccountingExportCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsAccountingExport({
    from: options.dateFrom,
    to: options.dateTo,
    format: asAccountingFormat(options.format),
    output: options.output,
    skipVerify: options.skipVerify,
    json: options.json,
  });
}

export async function runPaymentsTaxEvidenceCmd(options: PaymentsCliOptions = {}): Promise<number> {
  const format =
    options.format === "json" || options.format === "markdown" || options.format === "pack"
      ? options.format
      : undefined;
  return runPaymentsTaxEvidence({
    taxYear: options.taxYear,
    output: options.output,
    format,
    skipVerify: options.skipVerify,
    json: options.json,
  });
}

export async function runPaymentsTaxProfileSetCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsTaxProfileSet({
    partyId: options.partyId ?? options.creatorId ?? options.agentId,
    taxForm: options.taxForm,
    collected: options.collected,
    taxProfileRef: options.taxProfileRef,
    json: options.json,
  });
}

export async function runPaymentsTaxProfileShowCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsTaxProfileShow({
    partyId: options.partyId ?? options.creatorId ?? options.agentId,
    json: options.json,
  });
}

function orgCliOpts(options: PaymentsCliOptions) {
  return {
    orgId: options.orgId,
    actorTenantId: options.actorTenantId ?? options.tenantId,
    displayName: options.displayName ?? options.name,
    email: options.email ?? options.directoryEmail,
    memberTenantId: options.memberTenantId ?? options.toTenantId,
    allocationRoleId: options.allocationRoleId ?? options.requestRole,
    domains: options.domains,
    amountUsd: options.amount,
    json: options.json,
    prometheus: options.prometheus,
    includeWorm: options.includeWorm,
  };
}

export async function runPaymentsOrgCreateCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgCreate(orgCliOpts(options));
}

export async function runPaymentsOrgShowCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgShow(orgCliOpts(options));
}

export async function runPaymentsOrgSsoCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgSso(orgCliOpts(options));
}

export async function runPaymentsOrgInviteCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgInvite(orgCliOpts(options));
}

export async function runPaymentsOrgMembersCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgMembers(orgCliOpts(options));
}

export async function runPaymentsOrgSuspendCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgSuspend(orgCliOpts(options));
}

export async function runPaymentsOrgRemoveCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgRemove(orgCliOpts(options));
}

export async function runPaymentsOrgAllocateCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgAllocate(orgCliOpts(options));
}

export async function runPaymentsOrgDistributeCmd(
  options: PaymentsCliOptions = {}
): Promise<number> {
  return runPaymentsOrgDistribute(orgCliOpts(options));
}

export async function runPaymentsOrgSpendCmd(options: PaymentsCliOptions = {}): Promise<number> {
  return runPaymentsOrgSpend(orgCliOpts(options));
}
