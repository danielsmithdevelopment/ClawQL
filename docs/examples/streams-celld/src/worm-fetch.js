/**
 * Thin clawql-audit HTTP client for celld / Workers.
 * POST /entries with Authorization: ApiKey … — never embeds clawql-audit in the DO.
 *
 * Ring buffer (streams-slim) stays for session-resumption bookkeeping only.
 * Consequential agent events must land here (host WORMAuditTrail with tip-load).
 *
 * Fail-closed: when CLAWQL_AUDIT_WORM_URL is set, append failure must halt spawn —
 * never silently continue with ring-only logging.
 */

/** @typedef {{ url: string, apiKey?: string, timeoutMs?: number }} WormFetchConfig */

/**
 * When a host WORM URL is configured, require a successful append.
 * Unset URL → deferred (lab / mock without compliance sidecar).
 * @param {{ url?: string }} config
 * @param {{ ok?: boolean, deferred?: boolean, error?: string, reason?: string }} result
 */
export function requireComplianceWorm(config, result) {
  const url = String(config?.url || "").trim();
  if (!url) {
    return {
      ok: true,
      deferred: true,
      reason: result?.reason || "CLAWQL_AUDIT_WORM_URL unset",
    };
  }
  if (result?.ok === true) {
    return { ok: true, result };
  }
  return {
    ok: false,
    error:
      result?.error ||
      result?.reason ||
      "compliance WORM append failed — refusing ring-only continue",
    result,
  };
}

/**
 * @param {WormFetchConfig} config
 * @param {{
 *   type: string,
 *   timestamp?: string,
 *   sessionId: string,
 *   agentName?: string,
 *   virtualKeyId?: string,
 *   cellId?: string,
 *   metadata?: Record<string, unknown>,
 * }} entry
 */
export async function appendWormEntry(config, entry) {
  const base = String(config.url || "").replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      deferred: true,
      reason: "CLAWQL_AUDIT_WORM_URL unset — compliance WORM stays on host",
    };
  }

  /** @type {Record<string, string>} */
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `ApiKey ${config.apiKey}`;
  }

  const body = {
    type: entry.type,
    timestamp: entry.timestamp || new Date().toISOString(),
    sessionId: entry.sessionId,
    ...(entry.agentName ? { agentName: entry.agentName } : {}),
    ...(entry.virtualKeyId ? { virtualKeyId: entry.virtualKeyId } : {}),
    ...(entry.cellId ? { cellId: entry.cellId } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  };

  const timeoutMs = config.timeoutMs ?? 15_000;
  let res;
  try {
    res = await fetch(`${base}/entries`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      transport: "clawql-audit-http",
      url: base,
    };
  }

  const rawText = await res.text();
  let parsed = null;
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { text: rawText.slice(0, 500) };
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String(/** @type {{ error?: unknown }} */ (parsed).error)
          : null) || `HTTP ${res.status}: ${rawText.slice(0, 500)}`,
      transport: "clawql-audit-http",
      url: base,
      status: res.status,
      parsed,
    };
  }

  return {
    ok: true,
    transport: "clawql-audit-http",
    url: base,
    entry: parsed,
    chainIndex:
      parsed && typeof parsed === "object" && "chainIndex" in parsed
        ? /** @type {{ chainIndex?: number }} */ (parsed).chainIndex
        : undefined,
    hash:
      parsed && typeof parsed === "object" && "hash" in parsed
        ? /** @type {{ hash?: string }} */ (parsed).hash
        : undefined,
  };
}

/**
 * @param {WormFetchConfig} config
 * @param {{ sessionId?: string, limit?: number }} [filter]
 */
export async function queryWormEntries(config, filter = {}) {
  const base = String(config.url || "").replace(/\/$/, "");
  if (!base) {
    return { ok: false, deferred: true, reason: "CLAWQL_AUDIT_WORM_URL unset" };
  }
  const q = new URLSearchParams();
  if (filter.sessionId) q.set("sessionId", filter.sessionId);
  if (filter.limit != null) q.set("limit", String(filter.limit));
  /** @type {Record<string, string>} */
  const headers = { accept: "application/json" };
  if (config.apiKey) headers.authorization = `ApiKey ${config.apiKey}`;
  try {
    const res = await fetch(`${base}/entries?${q}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { ok: false, error: parsed?.error || text.slice(0, 500), status: res.status };
    }
    return {
      ok: true,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      transport: "clawql-audit-http",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
