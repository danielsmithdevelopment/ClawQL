/**
 * Agent compensation ledger — internal credits + real funds held for cash-out.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { resolveAgentAccountsPath } from "../config/paths.js";
import type { PayoutMethod } from "../payouts/preferences.js";

/** How an agent prefers to receive / hold value. */
export type CompensationHoldMethod = "credits" | "funds" | PayoutMethod;

export type AgentAccount = {
  readonly agentId: string;
  /** Internal swarm credits (fast; convertible at cash-out). */
  readonly creditsUsd: number;
  /** Real USD value already funded for this agent (treasury-backed). */
  readonly fundsUsd: number;
  /** Preferred cash-out destination when not specified. */
  readonly cashoutMethod?: PayoutMethod;
  readonly connectAccountId?: string;
  readonly usdcWallet?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly updatedAt: string;
};

type AccountsFile = {
  agents: Record<string, AgentAccount>;
};

async function loadFile(env: NodeJS.ProcessEnv): Promise<AccountsFile> {
  const path = resolveAgentAccountsPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as AccountsFile;
    if (!parsed || typeof parsed !== "object" || !parsed.agents) return { agents: {} };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { agents: {} };
    throw err;
  }
}

async function saveFile(file: AccountsFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveAgentAccountsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

function emptyAccount(agentId: string, tenantId?: string): AgentAccount {
  return {
    agentId,
    creditsUsd: 0,
    fundsUsd: 0,
    tenantId,
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated Prefer CompensationAccountsService.get — Promise façade retained for legacy callers. */
export async function getAgentAccount(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentAccount | undefined> {
  const file = await loadFile(env);
  return file.agents[agentId.trim()];
}

/** @deprecated Prefer CompensationAccountsService.ensure — Promise façade retained for legacy callers. */
export async function ensureAgentAccount(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
  tenantId?: string
): Promise<AgentAccount> {
  const id = agentId.trim();
  if (!id) throw new Error("agentId required");
  const file = await loadFile(env);
  const existing = file.agents[id];
  if (existing) return existing;
  const created = emptyAccount(id, tenantId?.trim() || undefined);
  file.agents[id] = created;
  await saveFile(file, env);
  return created;
}

/** @deprecated Prefer CompensationAccountsService.setPreference — Promise façade retained for legacy callers. */
export async function setAgentAccountPreference(
  input: {
    agentId: string;
    cashoutMethod?: PayoutMethod;
    connectAccountId?: string;
    usdcWallet?: string;
    email?: string;
    tenantId?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentAccount> {
  const file = await loadFile(env);
  const id = input.agentId.trim();
  const prev = file.agents[id] ?? emptyAccount(id, input.tenantId);
  const next: AgentAccount = {
    ...prev,
    cashoutMethod: input.cashoutMethod ?? prev.cashoutMethod,
    connectAccountId: input.connectAccountId?.trim() || prev.connectAccountId,
    usdcWallet: input.usdcWallet?.trim() || prev.usdcWallet,
    email: input.email?.trim() || prev.email,
    tenantId: input.tenantId?.trim() || prev.tenantId,
    updatedAt: new Date().toISOString(),
  };
  file.agents[id] = next;
  await saveFile(file, env);
  return next;
}

/** @deprecated Prefer CompensationAccountsService.credit — Promise façade retained for legacy callers. */
export async function creditAgentAccount(
  input: {
    agentId: string;
    creditsUsd?: number;
    fundsUsd?: number;
    tenantId?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentAccount> {
  const file = await loadFile(env);
  const id = input.agentId.trim();
  const prev = file.agents[id] ?? emptyAccount(id, input.tenantId);
  const creditsAdd = input.creditsUsd ?? 0;
  const fundsAdd = input.fundsUsd ?? 0;
  if (creditsAdd < 0 || fundsAdd < 0) throw new Error("credit amounts must be >= 0");
  const next: AgentAccount = {
    ...prev,
    creditsUsd: roundMoney(prev.creditsUsd + creditsAdd),
    fundsUsd: roundMoney(prev.fundsUsd + fundsAdd),
    tenantId: input.tenantId?.trim() || prev.tenantId,
    updatedAt: new Date().toISOString(),
  };
  file.agents[id] = next;
  await saveFile(file, env);
  return next;
}

/** @deprecated Prefer CompensationAccountsService.debit — Promise façade retained for legacy callers. */
export async function debitAgentAccount(
  input: {
    agentId: string;
    creditsUsd?: number;
    fundsUsd?: number;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentAccount> {
  const file = await loadFile(env);
  const id = input.agentId.trim();
  const prev = file.agents[id];
  if (!prev) throw new Error(`Unknown agent account: ${id}`);
  const creditsDebit = input.creditsUsd ?? 0;
  const fundsDebit = input.fundsUsd ?? 0;
  if (creditsDebit < 0 || fundsDebit < 0) throw new Error("debit amounts must be >= 0");
  if (prev.creditsUsd + 1e-9 < creditsDebit) {
    throw new Error(`Insufficient credits: have ${prev.creditsUsd}, need ${creditsDebit}`);
  }
  if (prev.fundsUsd + 1e-9 < fundsDebit) {
    throw new Error(`Insufficient funds: have ${prev.fundsUsd}, need ${fundsDebit}`);
  }
  const next: AgentAccount = {
    ...prev,
    creditsUsd: roundMoney(prev.creditsUsd - creditsDebit),
    fundsUsd: roundMoney(prev.fundsUsd - fundsDebit),
    updatedAt: new Date().toISOString(),
  };
  file.agents[id] = next;
  await saveFile(file, env);
  return next;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export class CompensationAccountsError extends Data.TaggedError("CompensationAccountsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

type SetAgentAccountPreferenceInput = Parameters<typeof setAgentAccountPreference>[0];
type CreditAgentAccountInput = Parameters<typeof creditAgentAccount>[0];
type DebitAgentAccountInput = Parameters<typeof debitAgentAccount>[0];

/** Effect surface over the agent compensation accounts ledger (credits + funds held for cash-out). */
export class CompensationAccountsService extends Context.Tag("clawql/CompensationAccountsService")<
  CompensationAccountsService,
  {
    readonly get: (
      agentId: string
    ) => Effect.Effect<AgentAccount | undefined, CompensationAccountsError>;
    readonly ensure: (
      agentId: string,
      tenantId?: string
    ) => Effect.Effect<AgentAccount, CompensationAccountsError>;
    readonly setPreference: (
      input: SetAgentAccountPreferenceInput
    ) => Effect.Effect<AgentAccount, CompensationAccountsError>;
    readonly credit: (
      input: CreditAgentAccountInput
    ) => Effect.Effect<AgentAccount, CompensationAccountsError>;
    readonly debit: (
      input: DebitAgentAccountInput
    ) => Effect.Effect<AgentAccount, CompensationAccountsError>;
  }
>() {}

export function compensationAccountsLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CompensationAccountsService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof CompensationAccountsError
          ? cause
          : new CompensationAccountsError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    CompensationAccountsService,
    CompensationAccountsService.of({
      get: (agentId) => run("Failed to load agent account", () => getAgentAccount(agentId, env)),
      ensure: (agentId, tenantId) =>
        run("Failed to ensure agent account", () => ensureAgentAccount(agentId, env, tenantId)),
      setPreference: (input) =>
        run("Failed to set agent account preference", () => setAgentAccountPreference(input, env)),
      credit: (input) =>
        run("Failed to credit agent account", () => creditAgentAccount(input, env)),
      debit: (input) => run("Failed to debit agent account", () => debitAgentAccount(input, env)),
    })
  );
}
