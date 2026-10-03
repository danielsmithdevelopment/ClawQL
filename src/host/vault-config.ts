/**
 * Obsidian vault startup validation (MCP transport). Path resolution lives in `clawql-memory/vault/config`.
 */

import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { Effect } from "effect";

export type VaultStartupStatus = {
  configured: boolean;
  path: string | null;
  writable: boolean;
  degraded: boolean;
  error?: string;
  fixCommand?: string;
};

let vaultStartupStatus: VaultStartupStatus = {
  configured: false,
  path: null,
  writable: true,
  degraded: false,
};

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * Ensures the vault path exists, is a directory, and is readable + writable.
 * No-op when vault is not configured.
 */
export function validateObsidianVaultAtStartupEffect(): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const vault = getObsidianVaultPath();
    if (vault === null) {
      return;
    }
    const st = yield* Effect.tryPromise({
      try: () => stat(vault),
      catch: (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        return new Error(
          `CLAWQL_OBSIDIAN_VAULT_PATH: path does not exist or is inaccessible: ${vault} (${msg})`,
          { cause: e }
        );
      },
    });
    if (!st.isDirectory()) {
      return yield* Effect.fail(new Error(`CLAWQL_OBSIDIAN_VAULT_PATH: not a directory: ${vault}`));
    }
    yield* Effect.tryPromise({
      try: () => access(vault, constants.R_OK | constants.W_OK),
      catch: (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        return new Error(`CLAWQL_OBSIDIAN_VAULT_PATH: not readable/writable: ${vault} (${msg})`, {
          cause: e,
        });
      },
    });
    console.error(`[clawql-mcp] Obsidian vault: ${vault}`);
  });
}

/** Promise façade for MCP/HTTP process start. */
export async function validateObsidianVaultAtStartup(): Promise<void> {
  return Effect.runPromise(validateObsidianVaultAtStartupEffect());
}

function defaultVaultPermissionFixHint(vault: string): string {
  if (vault === "/vault") {
    return 'mkdir -p "$HOME/.ClawQL/Memory" && chmod -R u+rwX,g+rwX "$HOME/.ClawQL"';
  }
  return `mkdir -p "${vault}" && chmod -R u+rwX,g+rwX "${vault}"`;
}

export function getVaultStartupStatus(): VaultStartupStatus {
  return vaultStartupStatus;
}

/**
 * Validate vault permissions. If unavailable, keep server booting but disable memory tools.
 */
export function validateOrDegradeObsidianVaultAtStartupEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const vault = getObsidianVaultPath();
    if (vault === null) {
      vaultStartupStatus = {
        configured: false,
        path: null,
        writable: true,
        degraded: false,
      };
      return;
    }
    const outcome = yield* validateObsidianVaultAtStartupEffect().pipe(
      Effect.map(() => ({ ok: true as const })),
      Effect.catch((e) => Effect.succeed({ ok: false as const, error: asError(e) }))
    );
    if (outcome.ok) {
      vaultStartupStatus = {
        configured: true,
        path: vault,
        writable: true,
        degraded: false,
      };
      return;
    }
    const msg = outcome.error.message;
    const fix = defaultVaultPermissionFixHint(vault);
    vaultStartupStatus = {
      configured: true,
      path: vault,
      writable: false,
      degraded: true,
      error: msg,
      fixCommand: fix,
    };
    // Keep MCP reachable for non-memory tools.
    process.env.CLAWQL_ENABLE_MEMORY = "0";
    console.error(
      `[clawql-mcp] Vault disabled for this run: ${msg}. Memory tools are unavailable. ` +
        `Fix path permissions, then restart. Suggested fix: ${fix}`
    );
  });
}

/** Promise façade for MCP/HTTP process start. */
export async function validateOrDegradeObsidianVaultAtStartup(): Promise<void> {
  return Effect.runPromise(validateOrDegradeObsidianVaultAtStartupEffect());
}
