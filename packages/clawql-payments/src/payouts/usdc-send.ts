/**
 * Live Base USDC ERC-20 transfer for creator payouts (optional `viem`).
 *
 * Uses dynamic import so `clawql-payments` stays usable without viem installed.
 */

import { Data } from "effect";

export class UsdcSendError extends Data.TaggedError("UsdcSendError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type UsdcSendResult = {
  txHash: string;
  from: string;
  to: string;
  amountAtomic: bigint;
  chainId: number;
  usdcAsset: string;
  dryRun: boolean;
};

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Base mainnet USDC. */
export const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Base Sepolia USDC (matches x402 default). */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export function isUsdcPayoutConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CLAWQL_PAYOUTS_USDC_PRIVATE_KEY?.trim());
}

export function usdcPayoutChainId(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_PAYOUTS_USDC_CHAIN_ID?.trim();
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const network = env.CLAWQL_X402_NETWORK?.trim() || env.CLAWQL_PAYOUTS_USDC_NETWORK?.trim();
  if (network === "eip155:8453" || network === "base") return 8453;
  return 84532; // Base Sepolia default
}

export function usdcPayoutAsset(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_PAYOUTS_USDC_ASSET?.trim() || env.CLAWQL_X402_USDC_ASSET?.trim();
  if (explicit) return explicit;
  return usdcPayoutChainId(env) === 8453 ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;
}

export function usdcPayoutRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_PAYOUTS_USDC_RPC_URL?.trim();
  if (explicit) return explicit;
  return usdcPayoutChainId(env) === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org";
}

function toAtomicUsdc(amountUsd: number): bigint {
  return BigInt(Math.round(amountUsd * 1_000_000));
}

/**
 * Send USDC on Base. Dry-run when no private key or CLAWQL_PAYOUTS_USDC_DRY_RUN=1.
 */
export async function sendUsdcPayout(
  input: {
    to: string;
    amountUsd: number;
    correlationId?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<UsdcSendResult> {
  const to = input.to.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new UsdcSendError({ reason: `Invalid USDC wallet address: ${to}` });
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new UsdcSendError({ reason: "amountUsd must be > 0" });
  }

  const amountAtomic = toAtomicUsdc(input.amountUsd);
  const chainId = usdcPayoutChainId(env);
  const usdcAsset = usdcPayoutAsset(env);
  const dryFlag = env.CLAWQL_PAYOUTS_USDC_DRY_RUN?.trim().toLowerCase();
  const forceDry = dryFlag === "1" || dryFlag === "true" || dryFlag === "yes" || dryFlag === "on";

  if (forceDry || !isUsdcPayoutConfigured(env)) {
    return {
      txHash: `0xdry${Date.now().toString(16)}`,
      from: "0x0000000000000000000000000000000000000000",
      to,
      amountAtomic,
      chainId,
      usdcAsset,
      dryRun: true,
    };
  }

  const pk = env.CLAWQL_PAYOUTS_USDC_PRIVATE_KEY!.trim();
  let viem: typeof import("viem");
  let accounts: typeof import("viem/accounts");
  let chains: typeof import("viem/chains");
  try {
    viem = await import("viem");
    accounts = await import("viem/accounts");
    chains = await import("viem/chains");
  } catch (cause) {
    throw new UsdcSendError({
      reason: "viem is required for live USDC payouts — npm i viem",
      cause,
    });
  }

  const chain = chainId === 8453 ? chains.base : chains.baseSepolia;
  const account = accounts.privateKeyToAccount(
    pk.startsWith("0x") ? (pk as `0x${string}`) : `0x${pk}`
  );
  const client = viem.createWalletClient({
    account,
    chain,
    transport: viem.http(usdcPayoutRpcUrl(env)),
  });

  try {
    const txHash = await client.writeContract({
      address: usdcAsset as `0x${string}`,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, amountAtomic],
      chain,
      account,
    });
    return {
      txHash,
      from: account.address,
      to,
      amountAtomic,
      chainId,
      usdcAsset,
      dryRun: false,
    };
  } catch (cause) {
    throw new UsdcSendError({
      reason: cause instanceof Error ? cause.message : "USDC transfer failed",
      cause,
    });
  }
}
