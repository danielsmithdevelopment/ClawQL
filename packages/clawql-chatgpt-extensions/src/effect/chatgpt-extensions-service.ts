import { Context, Effect, Layer } from "effect";
import {
  detectChatgptFeatureSupport,
  shouldExposeUiTools,
  type ChatgptFeatureSupport,
  type ClientCapabilitySnapshot,
} from "../capabilities.js";
import { isChatgptExtensionsEnabled } from "../config.js";
import {
  CONSOLE_SECTIONS,
  consoleUrlForAuditEntry,
  resolveConsoleDeepLink,
  sectionsForUser,
} from "../console.js";
import {
  listEvidenceForThread,
  recordEvidenceEntry,
  verifyEvidenceChain,
  type EvidenceEntry,
} from "../evidence.js";
import {
  evaluateWritePreconditions,
  openClawqlFile,
  scrubAbsolutePaths,
  type OpenFileInput,
} from "../files.js";
import {
  buildMandateApprovalForm,
  canElicitMandateForm,
  hashMandateChange,
  resolveMandateDecision,
  type MandateChange,
} from "../mandate-form.js";
import {
  demoMentionSources,
  loadVaultMentionSources,
  searchMentions,
  type MentionItem,
} from "../mentions.js";
import {
  defaultUserSettings,
  settingsReadPayload,
  updateUserSettings,
  type UserSettings,
} from "../settings-store.js";
import { readUiResource } from "../ui-resources.js";

export class ChatgptExtensionsService extends Context.Tag("clawql/ChatgptExtensionsService")<
  ChatgptExtensionsService,
  {
    readonly isEnabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
    readonly detectSupport: (
      caps?: ClientCapabilitySnapshot | null
    ) => Effect.Effect<ChatgptFeatureSupport>;
    readonly shouldExposeUi: (support: ChatgptFeatureSupport) => Effect.Effect<boolean>;
    readonly searchMentions: (
      query: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<{ items: MentionItem[] }>;
    readonly readSettings: (
      userId: string
    ) => Effect.Effect<ReturnType<typeof settingsReadPayload>>;
    readonly updateSettings: (
      userId: string,
      set: Partial<UserSettings>
    ) => Effect.Effect<UserSettings>;
    readonly buildMandateForm: (
      change: MandateChange
    ) => Effect.Effect<Record<string, unknown> | null>;
    readonly resolveMandate: (input: {
      change: MandateChange;
      approvedChangeHash: string;
      formResult: { action?: string; content?: Record<string, unknown> };
    }) => Effect.Effect<ReturnType<typeof resolveMandateDecision>>;
    readonly listEvidence: (opts: {
      threadId: string;
      userId: string;
      detail?: "summary" | "full";
    }) => Effect.Effect<EvidenceEntry[]>;
    readonly verifyEvidence: (
      entries: readonly EvidenceEntry[]
    ) => Effect.Effect<ReturnType<typeof verifyEvidenceChain>>;
    readonly consoleSections: (
      isAdmin: boolean
    ) => Effect.Effect<(typeof CONSOLE_SECTIONS)[number][]>;
    readonly resolveDeepLink: (
      path?: string
    ) => Effect.Effect<ReturnType<typeof resolveConsoleDeepLink>>;
    readonly openFile: (
      input: OpenFileInput,
      contentText: string
    ) => Effect.Effect<ReturnType<typeof openClawqlFile>>;
    readonly readUi: (uri: string) => Effect.Effect<ReturnType<typeof readUiResource>>;
  }
>() {}

export const ChatgptExtensionsServiceLive = Layer.succeed(
  ChatgptExtensionsService,
  ChatgptExtensionsService.of({
    isEnabled: (env) => Effect.sync(() => isChatgptExtensionsEnabled(env)),
    detectSupport: (caps) => Effect.sync(() => detectChatgptFeatureSupport(caps)),
    shouldExposeUi: (support) => Effect.sync(() => shouldExposeUiTools(support)),
    searchMentions: (query, env) =>
      Effect.sync(() => {
        const sources = [...loadVaultMentionSources(env), ...demoMentionSources()];
        return searchMentions(query, sources);
      }),
    readSettings: (userId) => Effect.sync(() => settingsReadPayload(userId)),
    updateSettings: (userId, set) => Effect.sync(() => updateUserSettings(userId, set)),
    buildMandateForm: (change) =>
      Effect.sync(() => (canElicitMandateForm(change) ? buildMandateApprovalForm(change) : null)),
    resolveMandate: (input) => Effect.sync(() => resolveMandateDecision(input)),
    listEvidence: (opts) =>
      Effect.sync(() =>
        listEvidenceForThread({
          threadId: opts.threadId,
          userId: opts.userId,
          detail: opts.detail ?? "summary",
        })
      ),
    verifyEvidence: (entries) => Effect.sync(() => verifyEvidenceChain(entries)),
    consoleSections: (isAdmin) => Effect.sync(() => sectionsForUser({ isAdmin })),
    resolveDeepLink: (path) => Effect.sync(() => resolveConsoleDeepLink(path)),
    openFile: (input, contentText) =>
      Effect.sync(
        () =>
          scrubAbsolutePaths(openClawqlFile(input, contentText)) as ReturnType<
            typeof openClawqlFile
          >
      ),
    readUi: (uri) => Effect.sync(() => readUiResource(uri)),
  })
);

export function runChatgptExtensionsEffect<A, E>(
  program: Effect.Effect<A, E, ChatgptExtensionsService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(ChatgptExtensionsServiceLive)));
}

export {
  defaultUserSettings,
  hashMandateChange,
  recordEvidenceEntry,
  consoleUrlForAuditEntry,
  evaluateWritePreconditions,
};
