/**
 * Canonical Vault KV field → env mapping for `secret/clawql/providers`.
 * Shared by MCP local vault, import-dotenv-to-vault, and dashboard.
 */

export type ProviderVaultKeyEntry = {
  readonly vaultProperty: string;
  readonly envKey: string;
  readonly envAliases: readonly string[];
  readonly label: string;
  readonly group: string;
  readonly hint?: string;
  /** Included in `clawql init` default-stack prompts. */
  readonly defaultStack?: boolean;
};

export const PROVIDER_VAULT_KEY_CATALOG: readonly ProviderVaultKeyEntry[] = [
  {
    vaultProperty: "githubToken",
    envKey: "CLAWQL_GITHUB_TOKEN",
    envAliases: ["CLAWQL_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "CLAWQL_BEARER_TOKEN"],
    label: "GitHub token",
    group: "Core integrations",
    hint: "Personal access token or fine-grained token for the GitHub API provider.",
    defaultStack: true,
  },
  {
    vaultProperty: "slackToken",
    envKey: "CLAWQL_SLACK_TOKEN",
    envAliases: ["CLAWQL_SLACK_TOKEN", "SLACK_BOT_TOKEN", "SLACK_TOKEN", "CLAWQL_SLACK_BOT_TOKEN"],
    label: "Slack bot token",
    group: "Core integrations",
    hint: "xoxb-… bot token for notify and Slack-backed workflows.",
    defaultStack: true,
  },
  {
    vaultProperty: "linearApiKey",
    envKey: "LINEAR_API_KEY",
    envAliases: ["LINEAR_API_KEY", "CLAWQL_LINEAR_API_KEY"],
    label: "Linear API key",
    group: "Core integrations",
    hint: "Personal API key for the bundled GraphQL Linear provider.",
    defaultStack: true,
  },
  {
    vaultProperty: "onyxApiToken",
    envKey: "ONYX_API_TOKEN",
    envAliases: ["ONYX_API_TOKEN", "CLAWQL_ONYX_API_TOKEN"],
    label: "Onyx API token",
    group: "Core integrations",
    hint: "Bearer token for knowledge_search_onyx and enterprise evidence.",
    defaultStack: true,
  },
  {
    vaultProperty: "notionApiToken",
    envKey: "NOTION_API_TOKEN",
    envAliases: ["NOTION_API_TOKEN", "CLAWQL_NOTION_API_TOKEN", "NOTION_TOKEN"],
    label: "Notion integration token",
    group: "Core integrations",
    hint: "Internal integration secret (secret_…) for the Notion REST API provider.",
    defaultStack: true,
  },
  {
    vaultProperty: "cloudflareApiToken",
    envKey: "CLAWQL_CLOUDFLARE_API_TOKEN",
    envAliases: ["CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN"],
    label: "Cloudflare API token",
    group: "Sharing & cloud",
    hint: "Token scoped to DNS or Workers as needed by the Cloudflare provider.",
    defaultStack: true,
  },
  {
    vaultProperty: "cloudflareAccountId",
    envKey: "CLAWQL_CLOUDFLARE_ACCOUNT_ID",
    envAliases: [
      "CLAWQL_CLOUDFLARE_ACCOUNT_ID",
      "CLAWQL_R2_ACCOUNT_ID",
      "CLOUDFLARE_ACCOUNT_ID",
    ],
    label: "Cloudflare account ID",
    group: "Sharing & cloud",
    hint: "Account id for R2 S3 endpoint (clawql sync) — Cloudflare dashboard → R2 → Overview.",
  },
  {
    vaultProperty: "r2AccessKeyId",
    envKey: "CLAWQL_SYNC_ACCESS_KEY_ID",
    envAliases: ["CLAWQL_SYNC_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"],
    label: "R2 S3 access key ID",
    group: "Sharing & cloud",
    hint: "R2 → Manage R2 API tokens → Create S3 credentials (for clawql sync push/pull).",
  },
  {
    vaultProperty: "r2SecretAccessKey",
    envKey: "CLAWQL_SYNC_SECRET_ACCESS_KEY",
    envAliases: ["CLAWQL_SYNC_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"],
    label: "R2 S3 secret access key",
    group: "Sharing & cloud",
    hint: "Secret for R2 S3 API — never commit; pair with r2AccessKeyId.",
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
    vaultProperty: "googleAccessToken",
    envKey: "CLAWQL_GOOGLE_ACCESS_TOKEN",
    envAliases: ["CLAWQL_GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    label: "Google access token",
    group: "Sharing & cloud",
    hint: "OAuth access token for Google Discovery API presets.",
  },
  {
    vaultProperty: "awsAccessKeyId",
    envKey: "CLAWQL_AWS_ACCESS_KEY_ID",
    envAliases: ["CLAWQL_AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"],
    label: "AWS access key ID",
    group: "Sharing & cloud",
    hint: "IAM access key for SigV4 when using bundled AWS presets.",
  },
  {
    vaultProperty: "awsSecretAccessKey",
    envKey: "CLAWQL_AWS_SECRET_ACCESS_KEY",
    envAliases: ["CLAWQL_AWS_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"],
    label: "AWS secret access key",
    group: "Sharing & cloud",
    hint: "IAM secret key paired with AWS access key ID.",
  },
  {
    vaultProperty: "awsSessionToken",
    envKey: "CLAWQL_AWS_SESSION_TOKEN",
    envAliases: ["CLAWQL_AWS_SESSION_TOKEN", "AWS_SESSION_TOKEN"],
    label: "AWS session token",
    group: "Sharing & cloud",
    hint: "Optional STS session token for assumed-role credentials.",
  },
  {
    vaultProperty: "awsRegion",
    envKey: "CLAWQL_AWS_REGION",
    envAliases: ["CLAWQL_AWS_REGION", "AWS_REGION", "AWS_DEFAULT_REGION"],
    label: "AWS region",
    group: "Sharing & cloud",
    hint: "Default region for regional AWS endpoints (e.g. us-east-1).",
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

export const DEFAULT_STACK_VAULT_ENTRIES = PROVIDER_VAULT_KEY_CATALOG.filter((e) => e.defaultStack);

export function buildProvidersVaultPayload(parsed: Record<string, string>): Record<string, string> {
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

export const PROVIDERS_VAULT_KV_PATH = "clawql/providers";

export function isProvidersVaultPath(logicalPath: string): boolean {
  return logicalPath.replace(/^\/+|\/+$/g, "") === PROVIDERS_VAULT_KV_PATH;
}

export function vaultProviderDataToEnv(vaultData: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of PROVIDER_VAULT_KEY_CATALOG) {
    const v = vaultData[entry.vaultProperty]?.trim();
    if (v) out[entry.envKey] = v;
  }
  return out;
}

export function applyEnvChangesToVaultProviderData(
  currentVault: Record<string, string>,
  literals: Record<string, string>,
  removeEnvKeys: string[]
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

export function providerCatalogEnvKeys(): string[] {
  return PROVIDER_VAULT_KEY_CATALOG.map((e) => e.envKey);
}

export function resolveProviderEnvAlias(key: string): string | undefined {
  for (const entry of PROVIDER_VAULT_KEY_CATALOG) {
    if (entry.envAliases.includes(key)) return entry.envKey;
  }
  return undefined;
}
