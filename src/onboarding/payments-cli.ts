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
  type SpendGroupBy,
  type PayoutMethod,
  type OffRampProvider,
} from "clawql-payments";

export type PaymentsCliOptions = {
  tier?: string;
  month?: string;
  groupBy?: SpendGroupBy;
  correlationId?: string;
  limit?: number;
  json?: boolean;
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
