/**
 * Process-bound session ATR for unified search skill filtering (8.0 §6.4).
 * Hosts (JWT ATR proxy, MCP session) bind tokens per request / process.
 * `undefined` = no ATR context → do not filter provider skills.
 */

let boundAtrTokens: readonly string[] | undefined;

/** Bind ATR tokens used by default `search` skill filtering. Pass `undefined` to clear. */
export function bindProcessSearchAtrTokens(tokens: readonly string[] | undefined): void {
  boundAtrTokens = tokens;
}

export function getProcessSearchAtrTokens(): readonly string[] | undefined {
  return boundAtrTokens;
}

/**
 * Resolve ATR for search: explicit option wins; else process bind;
 * else `CLAWQL_SESSION_ATR` (comma-separated) when set.
 */
export function resolveSearchAtrTokens(
  explicit?: readonly string[] | null
): readonly string[] | undefined {
  if (explicit === null) return undefined;
  if (explicit !== undefined) return explicit;
  if (boundAtrTokens !== undefined) return boundAtrTokens;
  const fromEnv = process.env.CLAWQL_SESSION_ATR?.trim();
  if (!fromEnv) return undefined;
  return fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
