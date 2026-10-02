import { APPROVAL_TIMEOUT } from "./config.js";

export type UserSettings = {
  readonly evidenceDetail: "summary" | "full";
  readonly approvalTimeoutMinutes: number;
  readonly showRedactedPlaceholders: boolean;
};

const DEFAULT_SETTINGS: UserSettings = {
  evidenceDetail: "summary",
  approvalTimeoutMinutes: APPROVAL_TIMEOUT.defaultMinutes,
  showRedactedPlaceholders: true,
};

/** In-process per-user settings (session-scoped until durable store lands). */
const byUser = new Map<string, UserSettings>();

export function defaultUserSettings(): UserSettings {
  return { ...DEFAULT_SETTINGS };
}

export function readUserSettings(userId: string): UserSettings {
  return { ...(byUser.get(userId) ?? DEFAULT_SETTINGS) };
}

export function updateUserSettings(userId: string, set: Partial<UserSettings>): UserSettings {
  const current = readUserSettings(userId);
  const next: UserSettings = {
    evidenceDetail: set.evidenceDetail ?? current.evidenceDetail,
    approvalTimeoutMinutes: clampTimeout(
      set.approvalTimeoutMinutes ?? current.approvalTimeoutMinutes
    ),
    showRedactedPlaceholders: set.showRedactedPlaceholders ?? current.showRedactedPlaceholders,
  };
  byUser.set(userId, next);
  return next;
}

function clampTimeout(minutes: number): number {
  if (!Number.isFinite(minutes)) return APPROVAL_TIMEOUT.defaultMinutes;
  return Math.min(
    APPROVAL_TIMEOUT.maxMinutes,
    Math.max(APPROVAL_TIMEOUT.minMinutes, Math.round(minutes))
  );
}

export function resetSettingsStoreForTests(): void {
  byUser.clear();
}

export function settingsReadPayload(userId: string): {
  schema: Record<string, unknown>;
  layout: unknown[];
  values: Record<string, unknown>;
} {
  const values = readUserSettings(userId);
  return {
    schema: {
      type: "object",
      properties: {
        evidenceDetail: {
          type: "string",
          enum: ["summary", "full"],
          title: "Evidence tab detail",
          description: "Summary or full tool-call detail in the Evidence tab",
        },
        approvalTimeoutMinutes: {
          type: "integer",
          minimum: APPROVAL_TIMEOUT.minMinutes,
          maximum: APPROVAL_TIMEOUT.maxMinutes,
          title: "Approval timeout (minutes)",
          description: "Bounded by admin policy",
        },
        showRedactedPlaceholders: {
          type: "boolean",
          title: "Show redacted spans as labeled placeholders",
        },
      },
      required: ["evidenceDetail", "approvalTimeoutMinutes", "showRedactedPlaceholders"],
    },
    layout: [
      {
        kind: "group",
        title: "Preferences",
        items: [
          { kind: "property", property: "evidenceDetail" },
          { kind: "property", property: "approvalTimeoutMinutes" },
          { kind: "property", property: "showRedactedPlaceholders" },
        ],
      },
      {
        kind: "group",
        title: "Actions",
        items: [
          {
            kind: "tool",
            tool: "clawql_console",
            title: "Open console",
            description: "Open the ClawQL sidebar console",
          },
        ],
      },
    ],
    values: { ...values },
  };
}
