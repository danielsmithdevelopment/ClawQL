/**
 * Egress / SSRF chokepoint (audit 5.07 scaffold).
 * Canonical implementation lives here; `clawql-api` re-exports for compatibility.
 */
export {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolved,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
} from "./safe-source-url.js";
