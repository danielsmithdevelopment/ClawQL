import {
  formatSecretsList,
  listProviderSecrets,
  resolveVaultPropertyId,
  setProviderSecret,
} from "./secrets.js";

export async function runSecretsList(): Promise<number> {
  const rows = await listProviderSecrets();
  console.log(formatSecretsList(rows));
  return 0;
}

export async function runSecretsSet(argv: string[]): Promise<number> {
  const raw = argv[0];
  if (!raw) {
    console.error("Usage: clawql secrets set <provider> [value]");
    return 1;
  }

  if (!resolveVaultPropertyId(raw)) {
    console.error(`Unknown provider or key: ${raw}`);
    console.error("Try: github, slack, linear, notion, onyx, cloudflare, …");
    return 1;
  }

  try {
    const value = argv[1];
    const { vaultProperty, label } = await setProviderSecret(raw, value);
    console.log(`✓ saved ${label} (${vaultProperty})`);
    return 0;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
