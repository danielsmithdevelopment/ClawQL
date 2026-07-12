/**
 * `clawql payments` — thin wrapper over clawql-payments.
 */

import {
  runPaymentsAudit,
  runPaymentsPlanShow,
  runPaymentsPlanUpgrade,
  runPaymentsSpendReport,
  runPaymentsStripeCustomerCreate,
  runPaymentsStripeInvoiceCreate,
  runPaymentsStripeSetup,
  runPaymentsStripeSubscriptionCreate,
  runPaymentsStripeWebhookListen,
  runPaymentsUsageReport,
  runPaymentsX402Gate,
  runPaymentsX402GateList,
  runPaymentsX402Reconcile,
  runPaymentsX402Verify,
  runPaymentsX402WalletSetup,
  type SpendGroupBy,
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
    tenantId: options.tenantId,
    correlationId: options.correlationId,
    json: options.json,
  });
}

export async function runPaymentsStripeWebhookListenCmd(): Promise<number> {
  return runPaymentsStripeWebhookListen();
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
