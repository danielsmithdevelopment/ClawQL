/**
 * Shared helpers for local sandbox_exec backends (Seatbelt, Docker, …).
 */

import crypto from "node:crypto";
import type { SandboxLanguage, SandboxPersistenceMode } from "./sandbox-types.js";

export function defaultPersistence(): SandboxPersistenceMode {
  const v = process.env.CLAWQL_SANDBOX_PERSISTENCE_MODE?.trim().toLowerCase();
  if (v === "ephemeral" || v === "session" || v === "persistent") return v;
  return "session";
}

export function parseTimeoutMs(requested?: number): number {
  const maxRaw = Number.parseInt(process.env.CLAWQL_SANDBOX_TIMEOUT_MS_MAX ?? "300000", 10);
  const max = Number.isFinite(maxRaw) && maxRaw >= 1000 ? maxRaw : 300000;
  const defRaw = Number.parseInt(process.env.CLAWQL_SANDBOX_TIMEOUT_MS ?? "120000", 10);
  const def = Number.isFinite(defRaw) && defRaw >= 1000 ? defRaw : 120000;
  const t = requested ?? def;
  return Math.min(Math.max(t, 1000), max);
}

export function resolveSandboxId(
  mode: SandboxPersistenceMode,
  sessionId: string | undefined
): string {
  if (mode === "ephemeral") {
    return `ephemeral-${crypto.randomUUID()}`;
  }
  if (mode === "persistent") {
    return "clawql-persistent";
  }
  const sid = sessionId?.trim() || "default";
  return `session-${sid}`;
}

export function snippetFilename(language: SandboxLanguage): string {
  switch (language) {
    case "python":
      return "clawql_snippet.py";
    case "javascript":
      return "clawql_snippet.mjs";
    case "shell":
      return "clawql_snippet.sh";
    default:
      return "clawql_snippet.txt";
  }
}
