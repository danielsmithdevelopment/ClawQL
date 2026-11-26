import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * `/audit` document navigations rewrite to `/console/audit`.
 * `/api/**` gets Host allowlisting and credential presence checks (audit 8.01 / 8.02).
 * Full JWT / desktop-token verification runs in route handlers (Node runtime).
 */

function hostnameFromHost(hostHeader: string | null): string {
  const host = (hostHeader ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return host.replace(/:\d+$/, "");
}

function apiHostAllowed(request: NextRequest): boolean {
  const hostname = hostnameFromHost(request.headers.get("host"));
  const allowed = new Set(
    (process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS ?? "127.0.0.1,localhost")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const extra = process.env.CLAWQL_DASHBOARD_PUBLIC_HOST?.trim().toLowerCase();
  if (extra) allowed.add(extra.replace(/:\d+$/, ""));
  return Boolean(hostname && allowed.has(hostname));
}

function hasApiCredential(request: NextRequest): boolean {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && auth.length > 8) return true;
  if (request.headers.get("x-clawql-desktop-token")?.trim()) return true;
  const cookie = request.headers.get("cookie") ?? "";
  return (
    /(?:^|;\s*)(?:sb-access-token|clawql-supabase-access-token|clawql-desktop-api-token)=/.test(
      cookie,
    )
  );
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // E2E harness routes gate themselves with CLAWQL_E2E_HARNESS=1.
    if (pathname.startsWith("/api/e2e/")) {
      return NextResponse.next();
    }
    // Liveness for probes / desktop waitForHttp — no secrets.
    if (pathname === "/api/k8s/health" || pathname === "/api/runtime/dashboard") {
      return NextResponse.next();
    }

    if (!apiHostAllowed(request)) {
      return NextResponse.json(
        { error: "Forbidden host" },
        { status: 403 },
      );
    }

    const needsCred =
      pathname.startsWith("/api/managed/") ||
      pathname.startsWith("/api/agent/") ||
      pathname.startsWith("/api/local/");

    // k8s secret routes use CLAWQL_DASHBOARD_SYNC_TOKEN (checked in handler).
    if (needsCred && !hasApiCredential(request)) {
      // Desktop / local: require the per-launch token. Managed: require cookie or Bearer.
      // Outside production, managed mock may still run — handlers decide.
      const isProd = process.env.NODE_ENV === "production";
      const desktop = process.env.CLAWQL_DESKTOP_MODE === "1";
      const e2e = process.env.CLAWQL_E2E_HARNESS === "1";
      if (desktop || (isProd && !e2e) || pathname.startsWith("/api/local/")) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    return NextResponse.next();
  }

  if (pathname !== "/audit" || request.method !== "GET") {
    return NextResponse.next();
  }

  if (searchParams.has("format")) {
    return NextResponse.next();
  }

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.next();
  }

  const dest = request.headers.get("sec-fetch-dest") ?? "";
  const wantsDocument = dest === "document" || accept.includes("text/html");
  if (!wantsDocument) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/console/audit";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/audit", "/api/:path*"],
};
