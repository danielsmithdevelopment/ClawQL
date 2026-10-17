import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Browser security headers for the managed dashboard.
 * Opt-out: CLAWQL_SECURITY_HEADERS=0. HSTS only when CLAWQL_HSTS=1 (TLS terminators).
 * CSP is app-shaped (Next needs self + inline for styles); MCP HTTP uses a stricter default-src none.
 * @see docs/security/http-security-headers.md
 */
function securityHeadersEnabled() {
  const v = process.env.CLAWQL_SECURITY_HEADERS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function hstsEnabled() {
  return process.env.CLAWQL_HSTS?.trim() === "1";
}

/** Dashboard CSP — tighter than open, looser than MCP JSON APIs. */
const DASHBOARD_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Allow local agents/browsers that hit 127.0.0.1 while Next advertises localhost. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /** Electron desktop bundles `.next/standalone` (see `apps/desktop/`). */
  output: "standalone",
  /** Monorepo: trace file inclusion from repo root when multiple lockfiles exist. */
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Externalize workspace packages so Next does not webpack their AWS/Effect graphs.
  // Do not list `effect` here — Next may auto-transpile it and rejects the conflict.
  serverExternalPackages: ["clawql-api", "clawql-auth", "clawql-core", "clawql-payments"],
  async headers() {
    if (!securityHeadersEnabled()) return [];
    /** @type {{ key: string, value: string }[]} */
    const headers = [
      { key: "Content-Security-Policy", value: DASHBOARD_CSP },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (hstsEnabled()) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
