/**
 * Canonical Vault KV field → Kubernetes Secret env key mapping for `secret/clawql/providers`.
 * Used by import-dotenv-to-vault and documented in docs/deployment/vault-provider-secrets.md ([#241]).
 */

export type ProviderVaultKeyEntry = {
  /** KV v2 property under `secret/clawql/providers`. */
  readonly vaultProperty: string;
  /** Primary env var injected via `envFromSecret` / ExternalSecret `secretKey`. */
  readonly envKey: string;
  /** `.env` keys to import (first non-empty wins). */
  readonly envAliases: readonly string[];
};

/** IDP + automation provider credentials (extend when adding bundled vendors). */
export const PROVIDER_VAULT_KEY_CATALOG: readonly ProviderVaultKeyEntry[] = [
  {
    vaultProperty: "githubToken",
    envKey: "CLAWQL_GITHUB_TOKEN",
    envAliases: ["CLAWQL_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "CLAWQL_BEARER_TOKEN"],
  },
  {
    vaultProperty: "slackToken",
    envKey: "CLAWQL_SLACK_TOKEN",
    envAliases: ["CLAWQL_SLACK_TOKEN", "SLACK_BOT_TOKEN", "SLACK_TOKEN", "CLAWQL_SLACK_BOT_TOKEN"],
  },
  {
    vaultProperty: "onyxApiToken",
    envKey: "ONYX_API_TOKEN",
    envAliases: ["ONYX_API_TOKEN", "CLAWQL_ONYX_API_TOKEN"],
  },
  {
    vaultProperty: "paperlessApiToken",
    envKey: "PAPERLESS_API_TOKEN",
    envAliases: ["PAPERLESS_API_TOKEN", "CLAWQL_PAPERLESS_API_TOKEN"],
  },
  {
    vaultProperty: "stirlingApiKey",
    envKey: "STIRLING_API_KEY",
    envAliases: ["STIRLING_API_KEY", "CLAWQL_STIRLING_API_KEY"],
  },
  {
    vaultProperty: "doclingApiKey",
    envKey: "DOCLING_API_KEY",
    envAliases: ["DOCLING_API_KEY", "CLAWQL_DOCLING_API_KEY"],
  },
  {
    vaultProperty: "nextcloudUsername",
    envKey: "NEXTCLOUD_USERNAME",
    envAliases: ["NEXTCLOUD_USERNAME", "CLAWQL_NEXTCLOUD_USERNAME"],
  },
  {
    vaultProperty: "nextcloudAppPassword",
    envKey: "NEXTCLOUD_APP_PASSWORD",
    envAliases: ["NEXTCLOUD_APP_PASSWORD", "CLAWQL_NEXTCLOUD_APP_PASSWORD", "NEXTCLOUD_PASSWORD"],
  },
  {
    vaultProperty: "coneshareApiToken",
    envKey: "CONESHARE_API_TOKEN",
    envAliases: ["CONESHARE_API_TOKEN", "CLAWQL_CONESHARE_API_TOKEN"],
  },
  {
    vaultProperty: "cloudflareApiToken",
    envKey: "CLAWQL_CLOUDFLARE_API_TOKEN",
    envAliases: ["CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN"],
  },
  {
    vaultProperty: "googleAccessToken",
    envKey: "CLAWQL_GOOGLE_ACCESS_TOKEN",
    envAliases: ["CLAWQL_GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
  },
  {
    vaultProperty: "atlassianApiToken",
    envKey: "CLAWQL_ATLASSIAN_TOKEN",
    envAliases: ["CLAWQL_ATLASSIAN_TOKEN", "ATLASSIAN_API_TOKEN", "JIRA_API_TOKEN"],
  },
  {
    vaultProperty: "labelStudioApiToken",
    envKey: "CLAWQL_LABEL_STUDIO_API_TOKEN",
    envAliases: ["CLAWQL_LABEL_STUDIO_API_TOKEN"],
  },
  {
    vaultProperty: "hitlWebhookToken",
    envKey: "CLAWQL_HITL_WEBHOOK_TOKEN",
    envAliases: ["CLAWQL_HITL_WEBHOOK_TOKEN"],
  },
  {
    vaultProperty: "coneshareWebhookToken",
    envKey: "CLAWQL_CONESHARE_WEBHOOK_TOKEN",
    envAliases: ["CLAWQL_CONESHARE_WEBHOOK_TOKEN"],
  },
];

export function buildProvidersVaultPayload(
  parsed: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of PROVIDER_VAULT_KEY_CATALOG) {
    for (const alias of entry.envAliases) {
      const v = parsed[alias]?.trim();
      if (v) {
        out[entry.vaultProperty] = v;
        break;
      }
    }
  }
  return out;
}
