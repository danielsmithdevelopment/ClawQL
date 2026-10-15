import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * `/audit` is both the console Audit page and the production-shaped audit API.
 * Document / RSC / Link traffic rewrites to `/console/audit`.
 * JSON API: `Accept: application/json` or `?format=` (e.g. ocsf).
 *
 * Next may strip internal `?_rsc=` from `searchParams` before middleware runs;
 * use request headers and the raw URL instead.
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
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

  const rsc = request.headers.get("rsc");
  const prefetch = request.headers.get("next-router-prefetch");
  const dest = request.headers.get("sec-fetch-dest") ?? "";
  const wantsHtml = dest === "document" || accept.includes("text/html");
  const hasRscQuery = request.url.includes("_rsc=");
  const isNextNavigation = rsc != null || prefetch != null || wantsHtml || hasRscQuery;

  // Plain fetch()/curl with Accept */* and no Next navigation signals → API.
  if (!isNextNavigation) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/console/audit";
  const res = NextResponse.rewrite(url);
  res.headers.set("x-clawql-audit-rewrite", "console");
  return res;
}

export const config = {
  matcher: ["/audit"],
};
