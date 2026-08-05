/**
 * MCP tools for payouts, Ramp agent cards, consumer off-ramps, and agent compensation.
 *
 * Enabled with CLAWQL_PAYMENTS_MCP_TOOLS=1. Optional AP2 gate via
 * CLAWQL_PAYMENTS_MCP_REQUIRE_AP2=1 (mandate JWT in tool args).
 */

import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { PayoutService } from "../payouts/payout-service.js";
import { RampService } from "../ramp/ramp-service.js";
import { ConsumerOffRampService } from "../offramp/consumer-offramp-service.js";
import { OfframpWebhookService } from "../offramp/offramp-webhook-service.js";
import { AgentCompensationService } from "../compensation/agent-compensation-service.js";
import { CreditsService } from "../credits/credits-service.js";
import {
  claimDirectory,
  getEmailEntry,
  getHandleEntry,
  listDirectory,
  resolveRecipient,
} from "../credits/directory.js";
import { Ap2MandateService } from "../ap2/ap2-mandate-service.js";
import { isAp2Enabled } from "../ap2/config.js";

export const PAYMENTS_TOOLS_PLUGIN_ID = "clawql-payments-tools";

function parseTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

export function paymentsMcpToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_MCP_TOOLS);
}

function requireAp2(env: NodeJS.ProcessEnv): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_MCP_REQUIRE_AP2) && isAp2Enabled(env);
}

async function assertAp2IfRequired(
  env: NodeJS.ProcessEnv,
  mandateJwt: string | undefined
): Promise<void> {
  if (!requireAp2(env)) return;
  if (!mandateJwt?.trim()) {
    throw new Error("AP2 mandate required — pass mandateJwt (CLAWQL_PAYMENTS_MCP_REQUIRE_AP2=1)");
  }
  await runPaymentsEffect(
    Effect.gen(function* () {
      const ap2 = yield* Ap2MandateService;
      return yield* ap2.verifyPaymentMandate({ raw: mandateJwt.trim(), env });
    }),
    env
  );
}

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const payoutCreateSchema = {
  amountUsd: z.number().positive().describe("Payout amount in USD"),
  destination: z.enum(["bank", "usdc"]).optional().describe("bank (Connect) or usdc (Base)"),
  connectAccountId: z.string().optional().describe("Stripe Connect account id for bank payouts"),
  usdcWallet: z.string().optional().describe("0x wallet for USDC payouts"),
  creatorId: z.string().optional().describe("Creator id with saved payout preference"),
  tenantId: z.string().optional(),
  description: z.string().optional(),
  mandateJwt: z.string().optional().describe("AP2 Payment Mandate JWT when required"),
};

const rampAgentCardSchema = {
  userId: z.string().describe("Ramp user id backing the agent card"),
  amountUsd: z.number().positive().describe("Spend cap in USD"),
  agentId: z.string().optional(),
  displayName: z.string().optional(),
  allowedVendorIds: z.array(z.string()).optional(),
  tenantId: z.string().optional(),
  mandateJwt: z.string().optional(),
};

const offrampSessionSchema = {
  amountUsd: z.number().positive().describe("USDC amount to sell for fiat"),
  walletAddress: z.string().describe("Creator USDC wallet (0x…)"),
  provider: z.enum(["moonpay", "transak"]).optional(),
  email: z.string().optional(),
  redirectUrl: z.string().optional(),
  tenantId: z.string().optional(),
  creatorId: z.string().optional(),
  mandateJwt: z.string().optional(),
};

const offrampWebhookSchema = {
  provider: z.enum(["moonpay", "transak"]).describe("Off-ramp provider"),
  rawBody: z.string().describe("Raw webhook JSON body"),
  signatureHeader: z
    .string()
    .optional()
    .describe("Moonpay-Signature-V2 header (required for moonpay)"),
  tenantId: z.string().optional(),
  mandateJwt: z.string().optional(),
};

/** Logical: agent.compensation.deposit.stage */
const compensationDepositStageSchema = {
  agentId: z.string().describe("Agent identity to credit"),
  amountUsd: z.number().positive().describe("Amount in USD (or credit units)"),
  asset: z
    .enum(["credits", "funds"])
    .optional()
    .describe("credits (swarm budget, default) or treasury-backed funds"),
  reason: z
    .enum(["sgdop_recruit", "diversity_dividend", "task_bounty", "manual"])
    .optional()
    .describe("Why this compensation exists — use sgdop_recruit when Coordinator recruits"),
  recruitmentId: z
    .string()
    .optional()
    .describe("SGDOP recruitment / blind-spot id for WORM traceability"),
  tenantId: z.string().optional(),
  mandateJwt: z
    .string()
    .optional()
    .describe("AP2 mandate JWT when CLAWQL_PAYMENTS_MCP_REQUIRE_AP2=1"),
};

/** Logical: agent.compensation.cashout.stage */
const compensationCashoutStageSchema = {
  agentId: z.string().describe("Agent whose balance to debit"),
  amountUsd: z.number().positive(),
  source: z.enum(["credits", "funds"]).optional().describe("Ledger bucket to debit"),
  destination: z.enum(["bank", "usdc"]).optional().describe("PayoutService destination"),
  connectAccountId: z.string().optional().describe("Stripe Connect account for bank cash-out"),
  usdcWallet: z.string().optional().describe("0x wallet for USDC cash-out"),
  tenantId: z.string().optional(),
  mandateJwt: z.string().optional(),
};

/** Logical: agent.compensation.*.confirm */
const compensationConfirmSchema = {
  actionId: z.string().describe("Pending action_id from the stage response"),
  code: z.string().describe("confirmation_code from the stage response"),
  mandateJwt: z.string().optional(),
};

/** Safe entry: stage prepaid credit P2P (inert until confirm). */
const creditsTransferStageSchema = {
  toTenantId: z
    .string()
    .optional()
    .describe("Recipient ClawQL tenant id (use toHandle for @payee)"),
  toHandle: z
    .string()
    .optional()
    .describe("Recipient @username from payments directory"),
  toEmail: z
    .string()
    .optional()
    .describe("Recipient email (default directory identity)"),
  amountUsd: z.number().positive().describe("Amount in USD to transfer from prepaid credits"),
  fromTenantId: z
    .string()
    .optional()
    .describe("Sender tenant (defaults to payments.json tenant / default)"),
  idempotencyKey: z.string().optional().describe("Replay-safe transfer key"),
  note: z.string().optional(),
  mandateJwt: z.string().optional(),
};

const creditsDirectoryClaimSchema = {
  email: z
    .string()
    .optional()
    .describe("Primary payee identity (recommended default, like Venmo/Cash App email)"),
  handle: z
    .string()
    .optional()
    .describe("Optional privacy username (@alice) — hide email from payers who use @handle"),
  tenantId: z.string().optional().describe("Tenant that owns the profile"),
  displayName: z.string().optional(),
};

const creditsDirectoryResolveSchema = {
  payee: z
    .string()
    .optional()
    .describe("Email, @username, or tenant id"),
  email: z.string().optional(),
  handle: z.string().optional().describe("Username e.g. @alice"),
};

/** High-impact: confirm staged P2P transfer (+ optional TOTP). */
const creditsTransferConfirmSchema = {
  actionId: z.string().describe("Pending action_id from payments_credits_transfer_stage"),
  code: z.string().describe("confirmation_code from the stage response"),
  totp: z.string().optional().describe("6-digit TOTP when CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1"),
  mandateJwt: z.string().optional(),
};

export function createPaymentsToolsPlugin(env: NodeJS.ProcessEnv = process.env): Plugin {
  return {
    id: PAYMENTS_TOOLS_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    vertical: "payments",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "payments_payout_create",
          schema: payoutCreateSchema,
          handler: async (args) => {
            const a = args as {
              amountUsd: number;
              destination?: "bank" | "usdc";
              connectAccountId?: string;
              usdcWallet?: string;
              creatorId?: string;
              tenantId?: string;
              description?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const payouts = yield* PayoutService;
                return yield* payouts.createPayout({
                  amountUsd: a.amountUsd,
                  destination: a.destination,
                  connectAccountId: a.connectAccountId,
                  usdcWallet: a.usdcWallet,
                  creatorId: a.creatorId,
                  tenantId: a.tenantId,
                  description: a.description,
                });
              }),
              env
            );
            return textResult(result);
          },
        });

        yield* api.registerMcpTool({
          name: "payments_ramp_agent_card_issue",
          schema: rampAgentCardSchema,
          handler: async (args) => {
            const a = args as {
              userId: string;
              amountUsd: number;
              agentId?: string;
              displayName?: string;
              allowedVendorIds?: string[];
              tenantId?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const ramp = yield* RampService;
                return yield* ramp.issueAgentCard({
                  userId: a.userId,
                  amountUsd: a.amountUsd,
                  agentId: a.agentId,
                  displayName: a.displayName,
                  allowedVendorIds: a.allowedVendorIds,
                  tenantId: a.tenantId,
                });
              }),
              env
            );
            // Never return PAN/CVV over MCP by default.
            return textResult({
              id: result.id,
              fundId: result.fundId,
              lastFour: result.lastFour,
              amountUsd: result.amountUsd,
              agentScoped: result.agentScoped,
              issuancePath: result.issuancePath,
              dryRun: result.dryRun,
            });
          },
        });

        yield* api.registerMcpTool({
          name: "payments_offramp_session_create",
          schema: offrampSessionSchema,
          handler: async (args) => {
            const a = args as {
              amountUsd: number;
              walletAddress: string;
              provider?: "moonpay" | "transak";
              email?: string;
              redirectUrl?: string;
              tenantId?: string;
              creatorId?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const offramp = yield* ConsumerOffRampService;
                return yield* offramp.createSession({
                  amountUsd: a.amountUsd,
                  walletAddress: a.walletAddress,
                  provider: a.provider,
                  email: a.email,
                  redirectUrl: a.redirectUrl,
                  tenantId: a.tenantId,
                  creatorId: a.creatorId,
                });
              }),
              env
            );
            return textResult(result);
          },
        });

        yield* api.registerMcpTool({
          name: "payments_offramp_webhook_process",
          schema: offrampWebhookSchema,
          handler: async (args) => {
            const a = args as {
              provider: "moonpay" | "transak";
              rawBody: string;
              signatureHeader?: string;
              tenantId?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const wh = yield* OfframpWebhookService;
                return yield* wh.process({
                  provider: a.provider,
                  rawBody: a.rawBody,
                  signatureHeader: a.signatureHeader,
                  tenantId: a.tenantId,
                });
              }),
              env
            );
            return textResult(result);
          },
        });

        yield* api.registerMcpTool({
          name: "payments_credits_directory_claim",
          description:
            "Register pay-by-email (default) and optional privacy @username in the payments directory.",
          schema: creditsDirectoryClaimSchema,
          handler: async (args) => {
            const a = args as {
              email?: string;
              handle?: string;
              tenantId?: string;
              displayName?: string;
            };
            const result = await claimDirectory({
              email: a.email,
              handle: a.handle,
              tenantId: a.tenantId?.trim() || "default",
              displayName: a.displayName,
            });
            return textResult(result);
          },
        });

        yield* api.registerMcpTool({
          name: "payments_credits_directory_resolve",
          description:
            "Resolve email, @username, or payee string to a tenant id via the payments directory.",
          schema: creditsDirectoryResolveSchema,
          handler: async (args) => {
            const a = args as { payee?: string; email?: string; handle?: string };
            const raw = a.payee?.trim() || a.email?.trim() || a.handle?.trim();
            if (!raw) throw new Error("Provide payee, email, or handle");
            if (a.email?.trim() && !a.payee) {
              const entry = await getEmailEntry(a.email);
              if (entry) return textResult(entry);
            }
            if (a.handle?.trim() && !a.payee) {
              const entry = await getHandleEntry(a.handle);
              if (entry) return textResult(entry);
            }
            return textResult(await resolveRecipient(raw, env));
          },
        });

        yield* api.registerMcpTool({
          name: "payments_credits_directory_list",
          description: "List payments directory profiles (email + optional @username).",
          schema: {},
          handler: async () => textResult({ profiles: await listDirectory() }),
        });

        yield* api.registerMcpTool({
          name: "payments_credits_transfer_stage",
          description:
            "Safe entry point: stage a prepaid credit P2P transfer. Prefer toEmail or toHandle (@bob). Inert until payments_credits_transfer_confirm.",
          schema: creditsTransferStageSchema,
          handler: async (args) => {
            const a = args as {
              toTenantId?: string;
              toHandle?: string;
              toEmail?: string;
              amountUsd: number;
              fromTenantId?: string;
              idempotencyKey?: string;
              note?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            let toTenantId = a.toTenantId?.trim();
            let toHandle: string | undefined;
            let toEmail: string | undefined;
            if (a.toEmail?.trim()) {
              const resolved = await resolveRecipient(a.toEmail, env, { forceEmail: true });
              toTenantId = resolved.tenantId;
              toHandle = resolved.handle;
              toEmail = resolved.email;
            } else if (a.toHandle?.trim()) {
              const resolved = await resolveRecipient(a.toHandle, env, { forceHandle: true });
              toTenantId = resolved.tenantId;
              toHandle = resolved.handle;
              toEmail = resolved.email;
            } else if (!toTenantId) {
              throw new Error("Provide toEmail, toHandle (@bob), or toTenantId");
            }
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const credits = yield* CreditsService;
                return yield* credits.stageTransfer({
                  fromTenantId: a.fromTenantId?.trim() || "default",
                  toTenantId: toTenantId!,
                  amountCents: Math.round(a.amountUsd * 100),
                  idempotencyKey: a.idempotencyKey,
                  note: a.note,
                });
              }),
              env
            );
            return textResult({
              ...result,
              toHandle,
              toEmail,
              next: "High-impact next step: call payments_credits_transfer_confirm with actionId + code (+ totp if required).",
            });
          },
        });

        yield* api.registerMcpTool({
          name: "payments_credits_transfer_confirm",
          description:
            "High-impact: confirm a staged prepaid credit P2P transfer (ledger move). Prefer payments_credits_transfer_stage first. Requires TOTP when CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1.",
          schema: creditsTransferConfirmSchema,
          handler: async (args) => {
            const a = args as {
              actionId: string;
              code: string;
              totp?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const credits = yield* CreditsService;
                return yield* credits.confirmTransfer({
                  actionId: a.actionId,
                  code: a.code,
                  totp: a.totp,
                });
              }),
              env
            );
            return textResult(result);
          },
        });

        // High-impact compensation (logical dotted names → underscores for MCP):
        // agent.compensation.deposit.stage / .confirm
        // agent.compensation.cashout.stage / .confirm
        yield* api.registerMcpTool({
          name: "agent_compensation_deposit_stage",
          description:
            "Safe entry point: stage an agent compensation deposit (credits/funds). Inert until agent_compensation_deposit_confirm — does not credit the ledger.",
          schema: compensationDepositStageSchema,
          handler: async (args) => {
            const a = args as {
              agentId: string;
              amountUsd: number;
              asset?: "credits" | "funds";
              reason?: "sgdop_recruit" | "diversity_dividend" | "task_bounty" | "manual";
              recruitmentId?: string;
              tenantId?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.stageDeposit({
                  agentId: a.agentId,
                  amountUsd: a.amountUsd,
                  asset: a.asset ?? "credits",
                  reason: a.reason ?? "manual",
                  recruitmentId: a.recruitmentId,
                  tenantId: a.tenantId,
                });
              }),
              env
            );
            return textResult({
              ...result,
              next: "High-impact next step: call agent_compensation_deposit_confirm with actionId + code to credit the ledger.",
            });
          },
        });

        yield* api.registerMcpTool({
          name: "agent_compensation_deposit_confirm",
          description:
            "High-impact: confirm a staged deposit and credit the agent ledger. Prefer agent_compensation_deposit_stage first; rejects non-deposit pending kinds.",
          schema: compensationConfirmSchema,
          handler: async (args) => {
            const a = args as { actionId: string; code: string; mandateJwt?: string };
            await assertAp2IfRequired(env, a.mandateJwt);
            const view = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.approve({ actionId: a.actionId, code: a.code });
              }),
              env
            );
            if (view.kind !== "deposit_credits" && view.kind !== "deposit_funds") {
              throw new Error(
                `action ${a.actionId} is kind=${view.kind}; use agent_compensation_cashout_confirm`
              );
            }
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.confirm({ actionId: a.actionId, code: a.code });
              }),
              env
            );
            return textResult(result);
          },
        });

        yield* api.registerMcpTool({
          name: "agent_compensation_cashout_stage",
          description:
            "Safe entry point: stage an agent cash-out. Inert until agent_compensation_cashout_confirm — does not debit or call PayoutService.",
          schema: compensationCashoutStageSchema,
          handler: async (args) => {
            const a = args as {
              agentId: string;
              amountUsd: number;
              source?: "credits" | "funds";
              destination?: "bank" | "usdc";
              connectAccountId?: string;
              usdcWallet?: string;
              tenantId?: string;
              mandateJwt?: string;
            };
            await assertAp2IfRequired(env, a.mandateJwt);
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.stageCashout({
                  agentId: a.agentId,
                  amountUsd: a.amountUsd,
                  source: a.source,
                  destination: a.destination,
                  connectAccountId: a.connectAccountId,
                  usdcWallet: a.usdcWallet,
                  tenantId: a.tenantId,
                });
              }),
              env
            );
            return textResult({
              ...result,
              next: "High-impact next step: call agent_compensation_cashout_confirm with actionId + code to debit and pay out.",
            });
          },
        });

        yield* api.registerMcpTool({
          name: "agent_compensation_cashout_confirm",
          description:
            "High-impact: confirm a staged cash-out (ledger debit + PayoutService). Prefer agent_compensation_cashout_stage first; rejects non-cashout pending kinds.",
          schema: compensationConfirmSchema,
          handler: async (args) => {
            const a = args as { actionId: string; code: string; mandateJwt?: string };
            await assertAp2IfRequired(env, a.mandateJwt);
            const view = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.approve({ actionId: a.actionId, code: a.code });
              }),
              env
            );
            if (view.kind !== "cashout") {
              throw new Error(
                `action ${a.actionId} is kind=${view.kind}; use agent_compensation_deposit_confirm`
              );
            }
            const result = await runPaymentsEffect(
              Effect.gen(function* () {
                const comp = yield* AgentCompensationService;
                return yield* comp.confirm({ actionId: a.actionId, code: a.code });
              }),
              env
            );
            return textResult(result);
          },
        });
      }),
  };
}
