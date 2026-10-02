/**
 * Cloudflare Worker: HTTPS edge URL with permissive CORS, forwards to Node clawql-mcp-http.
 * Gallery skill (https://github.com/danielsmithdevelopment/gallery) needs exposed mcp-session-id.
 */

export interface Env {
  /** Base URL of clawql-mcp-http, e.g. https://my-app.fly.dev (no trailing slash). */
  ORIGIN?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, Mcp-Session-Id, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

function mergeCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    h.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: h,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const base = (env.ORIGIN || "").trim().replace(/\/$/, "");
    if (!base) {
      return new Response("Misconfigured: set ORIGIN (wrangler secret or [vars])", {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: new Headers(CORS_HEADERS) });
    }

    const url = new URL(request.url);
    const target = base + url.pathname + url.search;

    const out = new Headers(request.headers);
    out.delete("host");

    const init: RequestInit = {
      method: request.method,
      headers: out,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstream = await fetch(target, init);
    return mergeCors(upstream);
  },
};
