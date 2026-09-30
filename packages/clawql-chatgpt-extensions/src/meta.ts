import { ICONS } from "./icons.js";

/** App-only visibility — keeps look-alike tools out of the model's catalog. */
export const APP_ONLY_VISIBILITY = ["app"] as const;

export function uiToolMeta(opts: {
  readonly entrypoints: readonly Record<string, unknown>[];
  readonly icon: { src: string; mimeType: string; sizes: string[] };
  readonly preferredModelDisplayMode?: "inline" | "fullscreen";
}): Record<string, unknown> {
  return {
    ui: {
      visibility: [...APP_ONLY_VISIBILITY],
    },
    "openai/ui": {
      entrypoints: opts.entrypoints,
      ...(opts.preferredModelDisplayMode
        ? { preferredModelDisplayMode: opts.preferredModelDisplayMode }
        : {}),
    },
    icons: [opts.icon],
  };
}

export function mentionsSearchMeta(): Record<string, unknown> {
  return {
    ui: { visibility: [...APP_ONLY_VISIBILITY] },
    "openai/extensions": {
      "mentions/search": {},
    },
    icons: [ICONS.mentions],
  };
}

export function evidenceToolMeta(): Record<string, unknown> {
  return uiToolMeta({
    entrypoints: [{ type: "thread" }],
    icon: ICONS.evidence,
    preferredModelDisplayMode: "inline",
  });
}

export function consoleToolMeta(): Record<string, unknown> {
  return uiToolMeta({
    entrypoints: [{ type: "global" }],
    icon: ICONS.console,
    preferredModelDisplayMode: "fullscreen",
  });
}

export function openFileToolMeta(): Record<string, unknown> {
  return uiToolMeta({
    entrypoints: [{ type: "file", extensions: [".cqe", ".cqk"] }],
    icon: ICONS.openFile,
  });
}

export function settingsToolMeta(): Record<string, unknown> {
  return {
    icons: [ICONS.settings],
  };
}
