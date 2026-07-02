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
  /** Operator-facing label (dashboard UI). */
  readonly label: string;
  /** Dashboard section grouping. */
  readonly group: string;
  /** Hint shown under the field in the dashboard. */
  readonly hint?: string;
};

/** IDP + automation provider credentials (extend when adding bundled vendors). */
export const PROVIDER_VAULT_KEY_CATALOG: readonly ProviderVaultKeyEntry[] = [
  {
    vaultProperty: "githubToken",
    envKey: "CLAWQL_GITHUB_TOKEN",
    envAliases: ["CLAWQL_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "CLAWQL_BEARER_TOKEN"],
    label: "GitHub token",
    group: "Core integrations",
    hint: "Personal access token or fine-grained token for the GitHub API provider.",
  },
  {
    vaultProperty: "slackToken",
    envKey: "CLAWQL_SLACK_TOKEN",
    envAliases: ["CLAWQL_SLACK_TOKEN", "SLACK_BOT_TOKEN", "SLACK_TOKEN", "CLAWQL_SLACK_BOT_TOKEN"],
    label: "Slack bot token",
    group: "Core integrations",
    hint: "xoxb-… bot token for notify and Slack-backed workflows.",
  },
  {
    vaultProperty: "onyxApiToken",
    envKey: "ONYX_API_TOKEN",
    envAliases: ["ONYX_API_TOKEN", "CLAWQL_ONYX_API_TOKEN"],
    label: "Onyx API token",
    group: "Core integrations",
    hint: "Bearer token for knowledge_search_onyx and enterprise evidence.",
  },
  {
    vaultProperty: "paperlessApiToken",
    envKey: "PAPERLESS_API_TOKEN",
    envAliases: ["PAPERLESS_API_TOKEN", "CLAWQL_PAPERLESS_API_TOKEN"],
    label: "Paperless API token",
    group: "Document pipeline (IDP)",
    hint: "Archive hop — Paperless-ngx REST API token.",
  },
  {
    vaultProperty: "stirlingApiKey",
    envKey: "STIRLING_API_KEY",
    envAliases: ["STIRLING_API_KEY", "CLAWQL_STIRLING_API_KEY"],
    label: "Stirling PDF API key",
    group: "Document pipeline (IDP)",
    hint: "Redaction / PDF tooling for the IDP pipeline.",
  },
  {
    vaultProperty: "doclingApiKey",
    envKey: "DOCLING_API_KEY",
    envAliases: ["DOCLING_API_KEY", "CLAWQL_DOCLING_API_KEY"],
    label: "Docling API key",
    group: "Document pipeline (IDP)",
    hint: "Layout parsing service for scanned documents.",
  },
  {
    vaultProperty: "nextcloudUsername",
    envKey: "NEXTCLOUD_USERNAME",
    envAliases: ["NEXTCLOUD_USERNAME", "CLAWQL_NEXTCLOUD_USERNAME"],
    label: "Nextcloud username",
    group: "Document pipeline (IDP)",
    hint: "Account used for intake and sync hops.",
  },
  {
    vaultProperty: "nextcloudAppPassword",
    envKey: "NEXTCLOUD_APP_PASSWORD",
    envAliases: ["NEXTCLOUD_APP_PASSWORD", "CLAWQL_NEXTCLOUD_APP_PASSWORD", "NEXTCLOUD_PASSWORD"],
    label: "Nextcloud app password",
    group: "Document pipeline (IDP)",
    hint: "App password (not your login password) for WebDAV/API access.",
  },
  {
    vaultProperty: "coneshareApiToken",
    envKey: "CONESHARE_API_TOKEN",
    envAliases: ["CONESHARE_API_TOKEN", "CLAWQL_CONESHARE_API_TOKEN"],
    label: "ConeShare API token",
    group: "Sharing & cloud",
    hint: "JWT or API token for virtual data room sharing.",
  },
  {
    vaultProperty: "cloudflareApiToken",
    envKey: "CLAWQL_CLOUDFLARE_API_TOKEN",
    envAliases: ["CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN"],
    label: "Cloudflare API token",
    group: "Sharing & cloud",
    hint: "Token scoped to DNS or Workers as needed by the Cloudflare provider.",
  },
  {
    vaultProperty: "googleAccessToken",
    envKey: "CLAWQL_GOOGLE_ACCESS_TOKEN",
    envAliases: ["CLAWQL_GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    label: "Google access token",
    group: "Sharing & cloud",
    hint: "OAuth access token for Google Discovery API presets.",
  },
  {
    vaultProperty: "atlassianApiToken",
    envKey: "CLAWQL_ATLASSIAN_TOKEN",
    envAliases: ["CLAWQL_ATLASSIAN_TOKEN", "ATLASSIAN_API_TOKEN", "JIRA_API_TOKEN"],
    label: "Atlassian API token",
    group: "Sharing & cloud",
    hint: "Jira / Bitbucket API token for Atlassian integrations.",
  },
  {
    vaultProperty: "labelStudioApiToken",
    envKey: "CLAWQL_LABEL_STUDIO_API_TOKEN",
    envAliases: ["CLAWQL_LABEL_STUDIO_API_TOKEN"],
    label: "Label Studio API token",
    group: "Human review (HITL)",
    hint: "Required when HITL Label Studio enqueue is enabled.",
  },
  {
    vaultProperty: "hitlWebhookToken",
    envKey: "CLAWQL_HITL_WEBHOOK_TOKEN",
    envAliases: ["CLAWQL_HITL_WEBHOOK_TOKEN"],
    label: "HITL webhook token",
    group: "Human review (HITL)",
    hint: "Shared secret for POST /hitl/label-studio/webhook callbacks.",
  },
  {
    vaultProperty: "coneshareWebhookToken",
    envKey: "CLAWQL_CONESHARE_WEBHOOK_TOKEN",
    envAliases: ["CLAWQL_CONESHARE_WEBHOOK_TOKEN"],
    label: "ConeShare webhook token",
    group: "Human review (HITL)",
    hint: "Validates inbound ConeShare document viewer events.",
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

/** Vault KV `clawql/providers` logical path (KV v2 under mount `secret`). */
export const PROVIDERS_VAULT_KV_PATH = "clawql/providers";

export function isProvidersVaultPath(logicalPath: string): boolean {
  return logicalPath.replace(/^\/+|\/+$/g, "") === PROVIDERS_VAULT_KV_PATH;
}

/** Map Vault property names → env keys for dashboard / Secret sync. */
export function vaultProviderDataToEnv(
  vaultData: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of PROVIDER_VAULT_KEY_CATALOG) {
    const v = vaultData[entry.vaultProperty]?.trim();
    if (v) out[entry.envKey] = v;
  }
  return out;
}

/** Merge env-key literals/removals into Vault property payload. */
export function applyEnvChangesToVaultProviderData(
  currentVault: Record<string, string>,
  literals: Record<string, string>,
  removeEnvKeys: string[],
): Record<string, string> {
  const envToProp = new Map(PROVIDER_VAULT_KEY_CATALOG.map((e) => [e.envKey, e.vaultProperty]));
  const next = { ...currentVault };
  for (const [envKey, value] of Object.entries(literals)) {
    const prop = envToProp.get(envKey);
    if (prop) next[prop] = value;
  }
  for (const envKey of removeEnvKeys) {
    const prop = envToProp.get(envKey);
    if (prop) delete next[prop];
  }
  return next;
}

/** All env keys recognized in provider catalog (for paste / import). */
export function providerCatalogEnvKeys(): string[] {
  return PROVIDER_VAULT_KEY_CATALOG.map((e) => e.envKey);
}

/** Alias → canonical env key for .env paste in dashboard. */
export function resolveProviderEnvAlias(key: string): string | undefined {
  for (const entry of PROVIDER_VAULT_KEY_CATALOG) {
    if (entry.envAliases.includes(key)) return entry.envKey;
  }
  return undefined;
}
