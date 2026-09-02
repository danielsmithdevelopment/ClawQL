/**
 * Tiny mcp-api-adapter REST client for celld / Workers.
 * POST /{toolName} with JSON args — no Express/gRPC/SDK in the DO bundle.
 */

/** @typedef {{ url: string, bearer?: string, timeoutMs?: number }} AdapterFetchConfig */

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
            (parsed &&
            typeof parsed === "object" &&
            "text" in parsed &&
            typeof /** @type {{ text?: unknown }} */ (parsed).text === "string"
              ? /** @type {{ text: string }} */ (parsed).text
              : "adapter tool returned isError"),
        }
      : {}),
  };
}
