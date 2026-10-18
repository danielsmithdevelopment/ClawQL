/**
 * Minimal sticky HTTP reverse proxy for Topology B equal-arm chaos.
 *
 * Sticky key (first match wins):
 *   1. Cookie `clawql_bench_sticky=<backendIndex>`
 *   2. Header `x-bench-sticky=<opaque>` (hashed to a backend)
 *   3. New assignment (round-robin) + Set-Cookie
 *
 * Clients from Node's undici fetch do not persist cookies — use
 * {@link createStickyFetch} when connecting MCP Streamable HTTP through the VIP.
 */
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";

const COOKIE_NAME = "clawql_bench_sticky";

/**
 * @param {object} opts
 * @param {string[]} opts.backends — e.g. ["http://127.0.0.1:19101", ...]
 * @param {number} [opts.listenPort] — 0 = ephemeral
 * @param {string} [opts.listenHost]
 */
export async function startStickyHttpLb({
  backends,
  listenPort = 0,
  listenHost = "127.0.0.1",
}) {
  if (!Array.isArray(backends) || backends.length === 0) {
    throw new Error("startStickyHttpLb: backends required");
  }
  const parsed = backends.map((b, i) => {
    const u = new URL(b.includes("://") ? b : `http://${b}`);
    return {
      index: i,
      host: u.hostname,
      port: Number(u.port || 80),
      origin: `${u.protocol}//${u.host}`,
    };
  });
  let rr = 0;
  const stats = {
    requests: 0,
    by_backend: Object.fromEntries(parsed.map((b) => [b.index, 0])),
    sticky_hits: 0,
    sticky_misses: 0,
  };

  function pickBackend(req) {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(\\d+)`));
    if (m) {
      const idx = Number(m[1]);
      if (Number.isInteger(idx) && idx >= 0 && idx < parsed.length) {
        stats.sticky_hits++;
        return { backend: parsed[idx], setCookie: false };
      }
    }
    const hdr = req.headers["x-bench-sticky"];
    if (hdr && typeof hdr === "string" && hdr.length > 0) {
      let h = 0;
      for (let i = 0; i < hdr.length; i++) h = (h * 31 + hdr.charCodeAt(i)) >>> 0;
      stats.sticky_hits++;
      return { backend: parsed[h % parsed.length], setCookie: true };
    }
    stats.sticky_misses++;
    const backend = parsed[rr % parsed.length];
    rr++;
    return { backend, setCookie: true };
  }

  const server = createServer((req, res) => {
    stats.requests++;
    const { backend, setCookie } = pickBackend(req);
    stats.by_backend[backend.index]++;

    const headers = { ...req.headers, host: `${backend.host}:${backend.port}` };
    delete headers["proxy-connection"];

    const proxyReq = httpRequest(
      {
        hostname: backend.host,
        port: backend.port,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const outHeaders = { ...proxyRes.headers };
        if (setCookie) {
          const existing = outHeaders["set-cookie"];
          const cookie = `${COOKIE_NAME}=${backend.index}; Path=/; HttpOnly; SameSite=Lax`;
          outHeaders["set-cookie"] = existing
            ? Array.isArray(existing)
              ? [...existing, cookie]
              : [existing, cookie]
            : cookie;
        }
        outHeaders["x-bench-backend"] = String(backend.index);
        res.writeHead(proxyRes.statusCode || 502, outHeaders);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
      }
      res.end(`lb backend error: ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  await new Promise((resolve) => server.listen(listenPort, listenHost, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : listenPort;
  const baseUrl = `http://${listenHost}:${port}`;

  return {
    baseUrl,
    mcpUrl: `${baseUrl}/mcp`,
    port,
    backends: parsed.map((b) => b.origin),
    sticky: { cookie: COOKIE_NAME, header: "x-bench-sticky" },
    stats: () => ({ ...stats, by_backend: { ...stats.by_backend } }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/**
 * Fetch wrapper that persists the LB sticky cookie for one MCP client.
 * @param {string} [stickyId] — optional X-Bench-Sticky value (stable per client)
 * @param {Record<string, string>} [extraHeaders] — e.g. Authorization for Executor
 */
export function createStickyFetch(stickyId, extraHeaders = null) {
  let cookie = "";
  return async function stickyFetch(input, init = {}) {
    const headers = new Headers(init.headers || {});
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        if (v != null && v !== "" && !headers.has(k)) headers.set(k, v);
      }
    }
    if (cookie) headers.set("cookie", cookie);
    if (stickyId) headers.set("x-bench-sticky", stickyId);
    const res = await fetch(input, { ...init, headers });
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    for (const sc of setCookies) {
      const m = sc.match(new RegExp(`^${COOKIE_NAME}=([^;]+)`));
      if (m) cookie = `${COOKIE_NAME}=${m[1]}`;
    }
    // Fallback: some runtimes expose a single set-cookie
    if (!cookie) {
      const single = res.headers.get("set-cookie");
      if (single) {
        const m = single.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
        if (m) cookie = `${COOKIE_NAME}=${m[1]}`;
      }
    }
    return res;
  };
}

export { COOKIE_NAME };
