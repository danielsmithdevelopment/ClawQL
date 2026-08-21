/**
 * Outbound OAuth provider endpoint / scope catalogs.
 */

export type ProviderOAuthConfig = {
  providerId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint?: string;
  scopes: Record<string, string[]>;
  supportsClientCredentials?: boolean;
  tokenTtlSeconds: number;
  /** Vault path hint for service-account JSON (Google). */
  serviceAccountPath?: string;
};

export type SlackProviderConfig = {
  providerId: "slack";
  botTokenPath: string;
  oauth: ProviderOAuthConfig;
};

export const GOOGLE_OAUTH_CONFIG: ProviderOAuthConfig = {
  providerId: "google",
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revokeEndpoint: "https://oauth2.googleapis.com/revoke",
  scopes: {
    gmail_read: ["https://www.googleapis.com/auth/gmail.readonly"],
    gmail_send: ["https://www.googleapis.com/auth/gmail.send"],
    gmail_full: ["https://mail.google.com/"],
    calendar_read: ["https://www.googleapis.com/auth/calendar.readonly"],
    calendar_write: ["https://www.googleapis.com/auth/calendar"],
    drive_read: ["https://www.googleapis.com/auth/drive.readonly"],
    drive_write: ["https://www.googleapis.com/auth/drive"],
  },
  serviceAccountPath: "vault://clawql/providers/google/service-account",
  tokenTtlSeconds: 3600,
};

export function microsoftOAuthConfig(tenant = "common"): ProviderOAuthConfig {
  return {
    providerId: "microsoft",
    authEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: {
      mail_read: ["Mail.Read"],
      mail_send: ["Mail.Send"],
      calendar_read: ["Calendars.Read"],
      calendar_write: ["Calendars.ReadWrite"],
      teams_read: ["Chat.Read", "ChannelMessage.Read.All"],
    },
    supportsClientCredentials: true,
    tokenTtlSeconds: 3600,
  };
}

export const MICROSOFT_OAUTH_CONFIG = microsoftOAuthConfig();

export const SLACK_CONFIG: SlackProviderConfig = {
  providerId: "slack",
  botTokenPath: "vault://clawql/providers/slack/bot-token",
  oauth: {
    providerId: "slack",
    authEndpoint: "https://slack.com/oauth/v2/authorize",
    tokenEndpoint: "https://slack.com/api/oauth.v2.access",
    scopes: {
      read_messages: ["channels:history", "im:history"],
      send_messages: ["chat:write"],
      read_users: ["users:read"],
    },
    tokenTtlSeconds: Number.POSITIVE_INFINITY,
  },
};

export type OutboundAuthMethod =
  | "api_key"
  | "oauth_client_credentials"
  | "oauth_code"
  | "vault_dynamic";

/** Which outbound auth method to prefer per provider slug. */
export const PROVIDER_AUTH_METHOD: Record<string, OutboundAuthMethod> = {
  github: "api_key",
  linear: "api_key",
  slack_bot: "api_key",
  slack_user: "oauth_code",
  google: "oauth_code",
  microsoft: "oauth_client_credentials",
  clickhouse: "api_key",
  cloudflare: "api_key",
  r2: "api_key",
  minio: "api_key",
  notion: "api_key",
  anthropic: "api_key",
  openrouter: "api_key",
};
