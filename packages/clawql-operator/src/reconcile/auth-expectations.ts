import type { ClawQLInstanceSpecV1Alpha1 } from "../spec/clawql-instance-v1alpha1.js";

/** Mirrors `src/provider-vault/catalog.ts` — keep in sync when catalog changes. */
export type VaultKeyExpectation = {
  readonly vaultProperty: string;
  readonly envKey: string;
  readonly label: string;
  readonly group: string;
  readonly defaultStack?: boolean;
};

export const OPERATOR_VAULT_KEY_CATALOG: readonly VaultKeyExpectation[] = [
  {
    vaultProperty: "githubToken",
    envKey: "CLAWQL_GITHUB_TOKEN",
    label: "GitHub token",
    group: "Core integrations",
    defaultStack: true,
  },
  {
    vaultProperty: "slackToken",
    envKey: "CLAWQL_SLACK_TOKEN",
    label: "Slack bot token",
    group: "Core integrations",
    defaultStack: true,
  },
  {
    vaultProperty: "linearApiKey",
    envKey: "LINEAR_API_KEY",
    label: "Linear API key",
    group: "Core integrations",
    defaultStack: true,
  },
  {
    vaultProperty: "onyxApiToken",
    envKey: "ONYX_API_TOKEN",
    label: "Onyx API token",
    group: "Core integrations",
    defaultStack: true,
  },
  {
    vaultProperty: "notionApiToken",
    envKey: "NOTION_API_TOKEN",
    label: "Notion integration token",
    group: "Core integrations",
    defaultStack: true,
  },
  {
    vaultProperty: "cloudflareApiToken",
    envKey: "CLAWQL_CLOUDFLARE_API_TOKEN",
    label: "Cloudflare API token",
    group: "Sharing & cloud",
    defaultStack: true,
  },
  {
    vaultProperty: "paperlessApiToken",
    envKey: "PAPERLESS_API_TOKEN",
    label: "Paperless API token",
    group: "Document pipeline (IDP)",
  },
  {
    vaultProperty: "stirlingApiKey",
    envKey: "STIRLING_API_KEY",
    label: "Stirling PDF API key",
    group: "Document pipeline (IDP)",
  },
  {
    vaultProperty: "doclingApiKey",
    envKey: "DOCLING_API_KEY",
    label: "Docling API key",
    group: "Document pipeline (IDP)",
  },
  {
    vaultProperty: "nextcloudUsername",
    envKey: "NEXTCLOUD_USERNAME",
    label: "Nextcloud username",
    group: "Document pipeline (IDP)",
  },
  {
    vaultProperty: "nextcloudAppPassword",
    envKey: "NEXTCLOUD_APP_PASSWORD",
    label: "Nextcloud app password",
    group: "Document pipeline (IDP)",
  },
];

export const CLAWQL_INSTANCE_AUTH_EXPECTATIONS_KEY = "authExpectations.json";

export type AuthExpectationsPayload = {
  readonly providerSecretName: string;
  readonly documentsEnabled: boolean;
  readonly required: readonly {
    readonly vaultProperty: string;
    readonly envKey: string;
    readonly label: string;
  }[];
};

export const DEFAULT_PROVIDER_SECRET_NAME = "clawql-provider-env";

/** Documents on → default stack + all IDP vault keys; documents off → default stack only. */
export function resolveRequiredVaultKeys(
  spec: ClawQLInstanceSpecV1Alpha1
): readonly VaultKeyExpectation[] {
  const documentsEnabled = spec.documents?.enabled !== false;
  if (documentsEnabled) {
    return OPERATOR_VAULT_KEY_CATALOG.filter(
      (e) => e.defaultStack || e.group === "Document pipeline (IDP)"
    );
  }
  return OPERATOR_VAULT_KEY_CATALOG.filter((e) => e.defaultStack);
}

export function buildAuthExpectationsPayload(
  spec: ClawQLInstanceSpecV1Alpha1,
  providerSecretName = DEFAULT_PROVIDER_SECRET_NAME
): AuthExpectationsPayload {
  const documentsEnabled = spec.documents?.enabled !== false;
  const required = resolveRequiredVaultKeys(spec).map((e) => ({
    vaultProperty: e.vaultProperty,
    envKey: e.envKey,
    label: e.label,
  }));
  return { providerSecretName, documentsEnabled, required };
}

export type ProviderSecretCheck = {
  readonly ready: boolean;
  readonly missing: readonly string[];
  readonly secretExists: boolean;
};

export function checkProviderSecret(
  secretData: Record<string, string> | undefined,
  expectations: AuthExpectationsPayload
): ProviderSecretCheck {
  if (!secretData) {
    return {
      ready: false,
      secretExists: false,
      missing: expectations.required.map((e) => e.envKey),
    };
  }
  const missing: string[] = [];
  for (const entry of expectations.required) {
    const fromEnv = secretData[entry.envKey]?.trim();
    const fromVault = secretData[entry.vaultProperty]?.trim();
    if (!fromEnv && !fromVault) {
      missing.push(entry.envKey);
    }
  }
  return { ready: missing.length === 0, secretExists: true, missing };
}
