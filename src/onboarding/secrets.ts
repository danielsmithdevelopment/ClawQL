import {
  DEFAULT_STACK_VAULT_ENTRIES,
  PROVIDER_VAULT_KEY_CATALOG,
  type ProviderVaultKeyEntry,
} from "../provider-vault/catalog.js";
import {
  readLocalProvidersVault,
  writeLocalProvidersVault,
} from "../provider-vault/local-store.js";
import { getLocalProvidersVaultPath } from "./paths.js";
import { promptSecret } from "./prompt-secret.js";

const SHORT_ALIASES: Record<string, string> = {
  github: "githubToken",
  slack: "slackToken",
  linear: "linearApiKey",
  notion: "notionApiToken",
  onyx: "onyxApiToken",
  cloudflare: "cloudflareApiToken",
  google: "googleAccessToken",
  aws: "awsAccessKeyId",
  paperless: "paperlessApiToken",
  atlassian: "atlassianApiToken",
};

export function resolveVaultPropertyId(id: string): string | undefined {
  const key = id.trim().toLowerCase();
  if (SHORT_ALIASES[key]) return SHORT_ALIASES[key];
  const byProperty = PROVIDER_VAULT_KEY_CATALOG.find(
    (e) => e.vaultProperty.toLowerCase() === key,
  );
  if (byProperty) return byProperty.vaultProperty;
  const byLabel = PROVIDER_VAULT_KEY_CATALOG.find((e) =>
    e.label.toLowerCase().includes(key),
  );
  return byLabel?.vaultProperty;
}

export function findCatalogEntry(vaultProperty: string): ProviderVaultKeyEntry | undefined {
  return PROVIDER_VAULT_KEY_CATALOG.find((e) => e.vaultProperty === vaultProperty);
}

export type SecretsListRow = {
  id: string;
  label: string;
  configured: boolean;
  masked?: string;
  defaultStack: boolean;
};

export async function listProviderSecrets(home?: string): Promise<SecretsListRow[]> {
  const vault = await readLocalProvidersVault(getLocalProvidersVaultPath(home));
  const data = vault?.data ?? {};
  const defaultProps = new Set(DEFAULT_STACK_VAULT_ENTRIES.map((e) => e.vaultProperty));

  return PROVIDER_VAULT_KEY_CATALOG.map((entry) => {
    const raw = data[entry.vaultProperty]?.trim();
    return {
      id: entry.vaultProperty,
      label: entry.label,
      configured: Boolean(raw),
      masked: raw ? maskSecret(raw) : undefined,
      defaultStack: defaultProps.has(entry.vaultProperty),
    };
  });
}

export function formatSecretsList(rows: SecretsListRow[]): string {
  const lines = ["Provider secrets vault", ""];
  for (const row of rows) {
    const tag = row.defaultStack ? " [default-stack]" : "";
    if (row.configured) {
      lines.push(`  ✓ ${row.label} (${row.id})${tag}  ${row.masked}`);
    } else {
      lines.push(`  · ${row.label} (${row.id})${tag}  — not set`);
    }
  }
  lines.push("", "Set: npx clawql secrets set <github|slack|linear|…>", "");
  return lines.join("\n");
}

export async function setProviderSecret(
  id: string,
  value?: string,
  home?: string,
): Promise<{ vaultProperty: string; label: string }> {
  const vaultProperty = resolveVaultPropertyId(id);
  if (!vaultProperty) {
    throw new Error(
      `Unknown provider id "${id}". Try: ${Object.keys(SHORT_ALIASES).join(", ")}`,
    );
  }
  const entry = findCatalogEntry(vaultProperty);
  const secret = value?.trim() || (await promptSecret(entry?.label ?? vaultProperty));
  if (!secret) {
    throw new Error("Empty value — secret not saved");
  }

  const vaultPath = getLocalProvidersVaultPath(home);
  const existing = (await readLocalProvidersVault(vaultPath))?.data ?? {};
  await writeLocalProvidersVault({ ...existing, [vaultProperty]: secret }, vaultPath);

  return { vaultProperty, label: entry?.label ?? vaultProperty };
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${"*".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}
