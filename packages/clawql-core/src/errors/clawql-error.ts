import { Data } from "effect";

/** Base tagged error for cross-package ClawQL failures. */
export class ClawQLError extends Data.TaggedError("ClawQLError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class PluginAlreadyRegisteredError extends Data.TaggedError("PluginAlreadyRegisteredError")<{
  readonly pluginId: string;
}> {}
