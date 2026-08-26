/**
 * Registry for WebMCP page sessions (cleared with spec cache).
 */

import type { WebmcpBrowserSession } from "../webmcp/webmcp-browser.js";

export type WebmcpSourceBinding = {
  sourceId: string;
  pageUrl: string;
  cdpUrl: string;
  session: WebmcpBrowserSession;
};

const bindings = new Map<string, WebmcpSourceBinding>();

export function registerWebmcpSourceBinding(binding: WebmcpSourceBinding): void {
  bindings.set(binding.sourceId, binding);
}

export function getWebmcpSourceBinding(sourceId: string): WebmcpSourceBinding | undefined {
  return bindings.get(sourceId);
}

export function resetWebmcpSourceRegistry(): void {
  for (const b of bindings.values()) {
    try {
      void b.session.close();
    } catch {
      /* noop */
    }
  }
  bindings.clear();
}
