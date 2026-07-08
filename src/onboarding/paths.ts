/**
 * ClawQL local home (~/.ClawQL): Obsidian memory vault + provider secrets vault.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const CLAWQL_HOME_ENV = "CLAWQL_HOME";

/** Obsidian + dashboard root (same as dashboard default when env unset). */
export function getClawqlHome(): string {
  const raw = process.env[CLAWQL_HOME_ENV]?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), ".ClawQL");
}

export function getClawqlEnvFilePath(home = getClawqlHome()): string {
  return join(home, "clawql.env");
}

export function getLocalProvidersVaultPath(home = getClawqlHome()): string {
  return join(home, "vault", "providers.json");
}

export function getMemoryDir(home = getClawqlHome()): string {
  return join(home, "Memory");
}

export function getDashboardChatsDir(home = getClawqlHome()): string {
  return join(home, "Dashboard", "chats");
}

/** Subdirs created by `clawql init`. */
export const INIT_DIRECTORIES = ["Memory", "Dashboard/chats", "Dashboard/logs", "vault"] as const;
