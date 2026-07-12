import { loadPaymentsConfig } from "../config/store.js";
import {
  createX402Gate,
  listX402Gates,
  reconcileX402Settlement,
  setupX402Wallet,
  verifyX402PaymentProof,
  type X402Asset,
} from "../x402/index.js";

export type PaymentsX402WalletSetupOptions = {
  address?: string;
  facilitatorUrl?: string;
  asset?: X402Asset;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsX402WalletSetup(
  options: PaymentsX402WalletSetupOptions = {}
): Promise<number> {
  if (!options.address?.trim()) {
    console.error("Usage: clawql payments x402 wallet setup --address 0x...");
    return 1;
  }

  const result = await setupX402Wallet(
    {
      address: options.address,
      facilitatorUrl: options.facilitatorUrl,
      defaultAsset: options.asset,
    },
    options.env
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(`x402 wallet configured: ${result.address}`);
  console.log(`Default asset: ${result.defaultAsset}`);
  console.log(`Saved to ${result.path}`);
  return 0;
}

export type PaymentsX402GateOptions = {
  resource?: string;
  tool?: string;
  price?: number;
  asset?: X402Asset;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsX402Gate(options: PaymentsX402GateOptions = {}): Promise<number> {
  if (options.price === undefined || options.price <= 0) {
    console.error(
      "Usage: clawql payments x402 gate --resource /v1/chat/completions --price 0.001 [--asset USDC]"
    );
    console.error("   or: clawql payments x402 gate --tool knowledge_search --price 0.0005");
    return 1;
  }
  if (!options.resource?.trim() && !options.tool?.trim()) {
    console.error("Provide --resource or --tool");
    return 1;
  }

  const { gate, path } = await createX402Gate(
    {
      resource: options.resource,
      tool: options.tool,
      price: options.price,
      asset: options.asset,
    },
    options.env
  );

  if (options.json) {
    console.log(JSON.stringify({ gate, path }, null, 2));
    return 0;
  }

  console.log(`Gated ${gate.resource} at ${gate.price} ${gate.asset}`);
  console.log(`Saved to ${path}`);
  return 0;
}

export type PaymentsX402VerifyOptions = {
  txHash?: string;
  signature?: string;
  payer?: string;
  amount?: number;
  json?: boolean;
};

export async function runPaymentsX402Verify(
  options: PaymentsX402VerifyOptions = {}
): Promise<number> {
  const result = verifyX402PaymentProof({
    txHash: options.txHash,
    signature: options.signature,
    payer: options.payer,
    amount: options.amount,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.valid ? 0 : 1;
  }

  if (!result.valid) {
    console.error(`Invalid x402 proof: ${result.reason}`);
    return 1;
  }

  console.log("x402 payment proof valid");
  if (result.payer) console.log(`Payer: ${result.payer}`);
  if (result.amount !== undefined)
    console.log(`Amount: ${result.amount} ${result.asset ?? "USDC"}`);
  return 0;
}

export type PaymentsX402ReconcileOptions = {
  date?: string;
  resource?: string;
  amount?: number;
  txHash?: string;
  tenantId?: string;
  correlationId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsX402Reconcile(
  options: PaymentsX402ReconcileOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const tenantId = options.tenantId ?? config.tenantId ?? "default";

  if (!options.resource?.trim() || options.amount === undefined) {
    const gates = await listX402Gates(env);
    if (options.json) {
      console.log(JSON.stringify({ date: options.date, gates, tenantId }, null, 2));
      return 0;
    }
    console.log(
      `x402 gates (${gates.length}) — use --resource and --amount to reconcile a settlement`
    );
    for (const gate of gates) {
      console.log(`  ${gate.resource}: ${gate.price} ${gate.asset}`);
    }
    return 0;
  }

  const settlement = await reconcileX402Settlement({
    tenantId,
    resource: options.resource,
    amountUsdc: options.amount,
    proof: { txHash: options.txHash },
    correlationId: options.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify(settlement, null, 2));
    return 0;
  }

  console.log(`Reconciled x402 settlement ${settlement.id} (${settlement.amountUsdc} USDC)`);
  return 0;
}

export async function runPaymentsX402GateList(
  options: { json?: boolean; env?: NodeJS.ProcessEnv } = {}
): Promise<number> {
  const gates = await listX402Gates(options.env);
  if (options.json) {
    console.log(JSON.stringify({ gates }, null, 2));
    return 0;
  }
  if (gates.length === 0) {
    console.log("No x402 gates configured.");
    return 0;
  }
  for (const gate of gates) {
    console.log(`${gate.id} ${gate.resource}: ${gate.price} ${gate.asset}`);
  }
  return 0;
}
