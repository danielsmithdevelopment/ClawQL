/**
 * Tiny mcp-api-adapter REST client for celld / Workers.
 * POST /{toolName} with JSON args — no Express/gRPC/SDK in the DO bundle.
 */

/** @typedef {{ url: string, bearer?: string, timeoutMs?: number, retries?: number }} AdapterFetchConfig */

/**
 * Transient upstream races (MCP briefly unavailable after vault IO / celld settle)
 * show up as fetch throw, HTTP 502/503/504, or adapter body "fetch failed".
 * @param {{ ok: boolean, status?: number, error?: string, parsed?: unknown }} out
 */
export function isTransientAdapterFailure(out) {
  if (!out || out.ok === true) return false;
  const status = typeof out.status === "number" ? out.status : 0;
  if (status === 502 || status === 503 || status === 504) return true;
  const err = String(out.error || "");
  if (/fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|upstream CallTool failed/i.test(err)) {
    return true;
  }
  const parsed = out.parsed;
  if (parsed && typeof parsed === "object") {
    const msg = String(
      /** @type {{ message?: unknown, text?: unknown, error?: unknown }} */ (parsed).message ||
        /** @type {{ text?: unknown }} */ (parsed).text ||
        /** @type {{ error?: unknown }} */ (parsed).error ||
        ""
    );
    if (/fetch failed|upstream CallTool failed/i.test(msg)) return true;
  }
  return false;
}

/**
 * @param {AdapterFetchConfig} config
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
export async function callAdapterTool(config, name, args = {}) {
  const base = String(config.url || "").replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      deferred: true,
      tool: name,
      reason: "CLAWQL_MCP_ADAPTER_URL unset — adapter REST stays on host",
    };
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) {
    return { ok: false, tool: name, error: "invalid tool name for adapter REST" };
  }

  /** @type {Record<string, string>} */
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (config.bearer) {
    headers.authorization = `Bearer ${config.bearer}`;
  }

  const url = `${base}/${encodeURIComponent(name)}`;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const maxAttempts = Math.max(1, Math.min(5, (config.retries ?? 3) + 1));

  /** @type {Awaited<ReturnType<typeof attemptOnce>> | null} */
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await attemptOnce({ url, base, headers, args, name, timeoutMs });
    if (last.ok || !isTransientAdapterFailure(last) || attempt === maxAttempts) {
      return last.ok ? last : { ...last, attempts: attempt, retried: attempt > 1 };
    }
    await sleep(150 * attempt);
  }
  return last;
}

/**
 * @param {{
 *   url: string,
 *   base: string,
 *   headers: Record<string, string>,
 *   args: Record<string, unknown>,
 *   name: string,
 *   timeoutMs: number,
 * }} opts
 */
async function attemptOnce(opts) {
  const { url, base, headers, args, name, timeoutMs } = opts;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      tool: name,
      error: err instanceof Error ? err.message : String(err),
      transport: "mcp-api-adapter-rest",
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
      tool: name,
      error:
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String(/** @type {{ error?: unknown }} */ (parsed).error)
          : null) || `HTTP ${res.status}: ${rawText.slice(0, 500)}`,
      transport: "mcp-api-adapter-rest",
      url: base,
      status: res.status,
      parsed,
    };
  }

  const isError =
    parsed &&
    typeof parsed === "object" &&
    /** @type {{ isError?: boolean }} */ (parsed).isError === true;

  return {
    ok: !isError,
    tool: name,
    parsed,
    transport: "mcp-api-adapter-rest",
    url: base,
    ...(isError
      ? {
          error:
            parsed &&
            typeof parsed === "object" &&
            "text" in parsed &&
            typeof (/** @type {{ text?: unknown }} */ (parsed).text) === "string"
              ? /** @type {{ text: string }} */ (parsed).text
              : "adapter tool returned isError",
        }
      : {}),
  };
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
