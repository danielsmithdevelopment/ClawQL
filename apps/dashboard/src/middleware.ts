import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * `/audit` is both the console Audit page and the production-shaped audit API.
 * Document navigations rewrite to `/console/audit`; JSON / ?format= clients hit the route handler.
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

  const dest = request.headers.get("sec-fetch-dest") ?? "";
  const wantsDocument = dest === "document" || accept.includes("text/html");
  if (!wantsDocument) {
    // fetch() default Accept */* — production-shaped API
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/console/audit";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/audit"],
};
