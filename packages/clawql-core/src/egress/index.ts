/**
 * Egress / SSRF chokepoint (audit 5.07).
 * Canonical implementation lives here; `clawql-api` re-exports for compatibility.
 * Domain wrappers (callback HTTPS-only, web loopback allow, schedule allowlist) stay thin.
 */
export {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolved,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
} from "./safe-source-url.js";
