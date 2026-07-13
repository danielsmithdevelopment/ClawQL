import { Data } from "effect";

/** Base tagged error for cross-package ClawQL failures. */
export class ClawQLError extends Data.TaggedError("ClawQLError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class PluginAlreadyRegisteredError extends Data.TaggedError("PluginAlreadyRegisteredError")<{
  readonly pluginId: string;
}> {}

export class McpToolAlreadyRegisteredError extends Data.TaggedError(
  "McpToolAlreadyRegisteredError"
)<{
  readonly toolName: string;
}> {}

/** Invalid or unreadable configuration (env, file, or schema). */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly key?: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}
