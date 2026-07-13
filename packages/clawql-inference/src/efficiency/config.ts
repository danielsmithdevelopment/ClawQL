import { loadModelEscalationConfig } from "../routing/config.js";
import { loadSemanticCacheConfig } from "../cache/types.js";
import type { EfficiencyLayerId, EfficiencyLayerStatus } from "./types.js";

function parseTruthy(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export type TokenEfficiencyConfig = {
  terse: { enabled: boolean };
  promptCache: { enabled: boolean };
  semanticCache: ReturnType<typeof loadSemanticCacheConfig>;
  historyCompress: {
    enabled: boolean;
    maxChars: number;
    keepRecentMessages: number;
  };
  promptCompress: {
    enabled: boolean;
    maxMessageChars: number;
  };
  httpAutoRoute: boolean;
  structuredOutput: { enabled: boolean };
  tokenBudget: { enabled: boolean };
  prefill: { enabled: boolean; opener: string };
  escalation: ReturnType<typeof loadModelEscalationConfig>;
};

const DEFAULT_HISTORY_MAX_CHARS = 48_000;
const DEFAULT_KEEP_RECENT = 6;
const DEFAULT_MAX_MESSAGE_CHARS = 12_000;
const DEFAULT_PREFILL_OPENER = "";

export function loadTokenEfficiencyConfig(
  env: NodeJS.ProcessEnv = process.env
): TokenEfficiencyConfig {
  const semanticCache = loadSemanticCacheConfig(env);

  const historyMaxRaw = env.CLAWQL_INFERENCE_HISTORY_MAX_CHARS?.trim();
  const historyMax = historyMaxRaw
    ? Number.parseInt(historyMaxRaw, 10)
    : DEFAULT_HISTORY_MAX_CHARS;
  const keepRecentRaw = env.CLAWQL_INFERENCE_HISTORY_KEEP_RECENT?.trim();
  const keepRecent = keepRecentRaw
    ? Number.parseInt(keepRecentRaw, 10)
    : DEFAULT_KEEP_RECENT;

  const maxMsgRaw = env.CLAWQL_INFERENCE_PROMPT_COMPRESS_MAX_CHARS?.trim();
  const maxMessageChars = maxMsgRaw
    ? Number.parseInt(maxMsgRaw, 10)
    : DEFAULT_MAX_MESSAGE_CHARS;

  const escalation = loadModelEscalationConfig(env);
  const httpAutoRoute =
    parseTruthy(env.CLAWQL_INFERENCE_HTTP_AUTO_ROUTE) ||
    (escalation.enabled && parseTruthy(env.CLAWQL_INFERENCE_ROUTING_HTTP, true));

  return {
    terse: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_TERSE, true),
    },
    promptCache: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_PROMPT_CACHE, true),
    },
    semanticCache,
    historyCompress: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_HISTORY_COMPRESS),
      maxChars:
        Number.isFinite(historyMax) && historyMax > 0 ? historyMax : DEFAULT_HISTORY_MAX_CHARS,
      keepRecentMessages:
        Number.isFinite(keepRecent) && keepRecent > 0 ? keepRecent : DEFAULT_KEEP_RECENT,
    },
    promptCompress: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_PROMPT_COMPRESS),
      maxMessageChars:
        Number.isFinite(maxMessageChars) && maxMessageChars > 0
          ? maxMessageChars
          : DEFAULT_MAX_MESSAGE_CHARS,
    },
    httpAutoRoute,
    structuredOutput: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_STRUCTURED_OUTPUT, true),
    },
    tokenBudget: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_TOKEN_BUDGET, true),
    },
    prefill: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_PREFILL),
      opener: env.CLAWQL_INFERENCE_PREFILL_OPENER?.trim() ?? DEFAULT_PREFILL_OPENER,
    },
    escalation,
  };
}

export function listEfficiencyLayerStatus(
  env: NodeJS.ProcessEnv = process.env
): EfficiencyLayerStatus[] {
  const config = loadTokenEfficiencyConfig(env);
  return [
    {
      id: "code-mode",
      enabled: true,
      scope: "mcp",
      note: "search + execute in clawql-api (always on)",
    },
    {
      id: "response-trim",
      enabled: true,
      scope: "mcp",
      note: "field projection in clawql-api execute",
    },
    {
      id: "terse",
      enabled: config.terse.enabled,
      scope: "inference",
    },
    {
      id: "prompt-cache",
      enabled: config.promptCache.enabled,
      scope: "inference",
    },
    {
      id: "semantic-cache",
      enabled: config.semanticCache.enabled,
      scope: "inference",
    },
    {
      id: "history-compress",
      enabled: config.historyCompress.enabled,
      scope: "inference",
    },
    {
      id: "prompt-compress",
      enabled: config.promptCompress.enabled,
      scope: "inference",
    },
    {
      id: "model-routing",
      enabled: config.escalation.enabled || config.httpAutoRoute,
      scope: "inference",
      note: config.httpAutoRoute ? "HTTP auto-route + Ouroboros escalation" : "Ouroboros only",
    },
    {
      id: "structured-output",
      enabled: config.structuredOutput.enabled,
      scope: "inference",
    },
    {
      id: "token-budget",
      enabled: config.tokenBudget.enabled,
      scope: "inference",
    },
    {
      id: "prefill",
      enabled: config.prefill.enabled,
      scope: "inference",
    },
    {
      id: "flywheel",
      enabled: true,
      scope: "export",
      note: "export → finetune → frugal tier registration",
    },
  ];
}

export function layerEnabled(config: TokenEfficiencyConfig, id: EfficiencyLayerId): boolean {
  switch (id) {
    case "terse":
      return config.terse.enabled;
    case "prompt-cache":
      return config.promptCache.enabled;
    case "semantic-cache":
      return config.semanticCache.enabled;
    case "history-compress":
      return config.historyCompress.enabled;
    case "prompt-compress":
      return config.promptCompress.enabled;
    case "model-routing":
      return config.escalation.enabled || config.httpAutoRoute;
    case "structured-output":
      return config.structuredOutput.enabled;
    case "token-budget":
      return config.tokenBudget.enabled;
    case "prefill":
      return config.prefill.enabled;
    case "flywheel":
      return true;
    case "code-mode":
    case "response-trim":
      return true;
    default:
      return false;
  }
}
