export type {
  BrowserCapabilities,
  BrowserStep,
  FetchOptions,
  PageContent,
  SearchOptions,
  SearchResponse,
  SearchResult,
  WebBrowserProvider,
  WebBrowserProviderId,
  WebSearchProvider,
  WebSearchProviderId,
} from "./interfaces.js";
export { envImpliesWebEnabled, isWebEnabled, loadWebConfig, type WebConfig } from "./config.js";
export {
  appendWebAudit,
  installWebAuditWormSink,
  listWebAuditEvents,
  resetWebAuditForTests,
  setWebAuditSink,
  type WebAuditEvent,
  type WebAuditEventType,
  type WebAuditSink,
} from "./audit.js";
export {
  appendWebWormEvent,
  listWebWormRecords,
  resetWebWormStoreForTests,
  resolveWebAuditStoreMode,
  verifyWebWormLog,
  type WebAuditStoreMode,
  type WebAuditVerifyResult,
  type WebWormRecord,
} from "./audit/worm.js";
export { resolveCdpWebSocketUrl } from "./providers/browser/cdp.js";
export { WebCapabilityError, isWebCapabilityError, type WebCapabilityErrorCode } from "./errors.js";
export { createWebService, type WebService } from "./service.js";
export { browserAsSearch } from "./providers/fallback-search.js";
export { resolveSearchProvider } from "./providers/search/resolve.js";
export { buildOpensearchAuthHeaders } from "./providers/search/opensearch.js";
export { resolveBrowserProvider } from "./providers/browser/resolve.js";
export {
  assertSafeWebUrl,
  fetchRawUrl,
  type RawFetchResult,
} from "./providers/browser/raw-fetch.js";
export { createWebPlugin, makeWebLayer, WEB_PLUGIN_ID } from "./plugin/index.js";
