/**
 * Atomic MCP client config writes (audit 2.14).
 * Temp-file + rename, preserve mode, single `.bak`, skip when unchanged.
 */

import { copyFile, chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { buildMcpServerConfig, type McpConfigOptions } from "./mcp-config.js";

export type McpWriteTarget = "cursor" | "claude-desktop";

export function resolveMcpConfigPath(target: McpWriteTarget): string {
  if (target === "cursor") {
    return join(homedir(), ".cursor", "mcp.json");
  }
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export type WriteMcpConfigResult = {
  path: string;
  backupPath?: string;
  created: boolean;
  /** True when the on-disk file already matched the desired content. */
  skipped?: boolean;
};

/** Strip line and block comments so Cursor JSONC configs do not crash the parser. */
export function stripJsoncComments(raw: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringQuote: '"' | "'" | null = null;
  let escaped = false;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "/") {
      i += 2;
      while (i < raw.length && raw[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i + 1 < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, raw.length);
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function parseMcpConfigJson(raw: string): Record<string, unknown> {
  const cleaned = stripJsoncComments(raw);
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Write `content` via temp file + rename. Preserves existing file mode when present.
 */
export function writeFileAtomicEffect(
  path: string,
  content: string,
  mode?: number
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      let keepMode = mode;
      if (keepMode === undefined && existsSync(path)) {
        try {
          keepMode = (await stat(path)).mode & 0o777;
        } catch {
          /* ignore */
        }
      }
      const tmp = `${path}.clawql-tmp-${process.pid}-${Date.now()}`;
      const opts: { encoding: BufferEncoding; mode?: number } = { encoding: "utf8" };
      if (keepMode !== undefined) opts.mode = keepMode;
      await writeFile(tmp, content, opts);
      if (keepMode !== undefined) {
        try {
          await chmod(tmp, keepMode);
        } catch {
          /* best-effort on platforms without chmod */
        }
      }
      await rename(tmp, path);
      if (keepMode !== undefined) {
        try {
          await chmod(path, keepMode);
        } catch {
          /* best-effort */
        }
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export async function writeFileAtomic(
  path: string,
  content: string,
  mode?: number
): Promise<void> {
  return Effect.runPromise(writeFileAtomicEffect(path, content, mode));
}

/**
 * Ensure a single `.bak` exists (not timestamped spam). Skip if `.bak` already present.
 */
export function backupOnceEffect(path: string): Effect.Effect<string | undefined, Error> {
  return Effect.tryPromise({
    try: async () => {
      if (!existsSync(path)) return undefined;
      const backupPath = `${path}.bak`;
      if (existsSync(backupPath)) return undefined;
      await copyFile(path, backupPath);
      try {
        const mode = (await stat(path)).mode & 0o777;
        await chmod(backupPath, mode);
      } catch {
        /* best-effort */
      }
      return backupPath;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function writeMcpConfigFileEffect(
  target: McpWriteTarget,
  options: McpConfigOptions = {}
): Effect.Effect<WriteMcpConfigResult, Error> {
  return Effect.gen(function* () {
    const path = resolveMcpConfigPath(target);
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(path), { recursive: true }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    let existing: Record<string, unknown> = {};
    let created = true;
    let existingRaw: string | undefined;

    if (existsSync(path)) {
      created = false;
      existingRaw = yield* Effect.tryPromise({
        try: () => readFile(path, "utf8"),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });
      try {
        existing = parseMcpConfigJson(existingRaw);
      } catch (e) {
        return yield* Effect.fail(
          new Error(
            `Failed to parse MCP config at ${path} (JSON/JSONC). Fix or remove the file before rewriting.`,
            { cause: e }
          )
        );
      }
    }

    const incoming = buildMcpServerConfig(options);
    const incomingServers = (incoming.mcpServers ?? {}) as Record<string, unknown>;
    const mergedServers = {
      ...((existing.mcpServers as Record<string, unknown> | undefined) ?? {}),
      ...incomingServers,
    };

    const out: Record<string, unknown> = {
      ...existing,
      mcpServers: mergedServers,
    };
    delete out._clawql_note;

    const nextRaw = stableJson(out);
    if (existingRaw !== undefined) {
      try {
        const prevNormalized = stableJson(parseMcpConfigJson(existingRaw));
        if (prevNormalized === nextRaw) {
          return { path, created, skipped: true };
        }
      } catch {
        /* fall through to write */
      }
    }

    const backupPath = yield* backupOnceEffect(path);
    yield* writeFileAtomicEffect(path, nextRaw);
    return { path, backupPath, created, skipped: false };
  });
}

export async function writeMcpConfigFile(
  target: McpWriteTarget,
  options: McpConfigOptions = {}
): Promise<WriteMcpConfigResult> {
  return Effect.runPromise(writeMcpConfigFileEffect(target, options));
}
