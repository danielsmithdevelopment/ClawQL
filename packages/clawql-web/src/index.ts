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
export {
  envImpliesWebEnabled,
  isWebEnabled,
  loadWebConfig,
  type WebConfig,
} from "./config.js";
export {
  appendWebAudit,
  listWebAuditEvents,
  resetWebAuditForTests,
  setWebAuditSink,
  type WebAuditEvent,
  type WebAuditEventType,
  type WebAuditSink,
} from "./audit.js";
export { createWebService, type WebService } from "./service.js";
export { browserAsSearch } from "./providers/fallback-search.js";
export { resolveSearchProvider } from "./providers/search/resolve.js";
export { resolveBrowserProvider } from "./providers/browser/resolve.js";
export { createWebPlugin, makeWebLayer, WEB_PLUGIN_ID } from "./plugin/index.js";
