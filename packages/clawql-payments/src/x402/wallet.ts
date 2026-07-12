import { mergePaymentsConfig } from "../config/store.js";

export type X402Asset = "USDC";

export type X402WalletSetupInput = {
  address: string;
  facilitatorUrl?: string;
  defaultAsset?: X402Asset;
};

export type X402WalletSetupResult = {
  address: string;
  facilitatorUrl?: string;
  defaultAsset: X402Asset;
  path: string;
};

export async function setupX402Wallet(
  input: X402WalletSetupInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<X402WalletSetupResult> {
  const { config, path } = await mergePaymentsConfig(
    {
      x402: {
        walletAddress: input.address,
        facilitatorUrl: input.facilitatorUrl,
        defaultAsset: input.defaultAsset ?? "USDC",
      },
    },
    env
  );

  return {
    address: config.x402.walletAddress ?? input.address,
    facilitatorUrl: config.x402.facilitatorUrl,
    defaultAsset: config.x402.defaultAsset,
    path,
  };
}
