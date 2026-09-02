# Click-to-claim · third-party page WebMCP → `/mcp-ui`

Protocol Fabric demo: a third-party site registers agent tools on
`document.modelContext`. ClawQL opens that page over **Chrome CDP**, proxies
those tools as MCP, and re-surfaces the claim as a human **Click to claim**
button in `/mcp-ui`. Coupon logic lives **only on the page** — the MCP server
does not mint codes.

```text
[ site.html :8765 ]
  document.modelContext.registerTool(cf_*)
        ↑ CDP Runtime.evaluate (getTools / executeTool)
[ Chrome --remote-debugging-port ]
        ↑
[ cloudflare-claim-server.mjs ]  thin MCP proxy (no page logic)
        ↑ gRPC
[ mcp-api-adapter /mcp-ui ]
  presets/cloudflare-claim → customHtml: claim-button
```

## Run

```bash
npm run build -w mcp-grpc-transport -w mcp-api-adapter
node examples/mcp-api-adapter/cloudflare-claim-server.mjs
```

Requires Chrome/Chromium on `PATH` (or `CHROME_PATH`). The demo launches
headless Chrome with CDP on `:9222` unless `WEBMCP_SKIP_CHROME_LAUNCH=1` and
you already have a debugger at `CLAWQL_WEBMCP_CDP_URL`.

- Third-party page: http://127.0.0.1:8765/
- Page audit probe: http://127.0.0.1:8765/__webmcp/page-state
- Human UI: http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim

Walk the preset: **Start** → reveal challenge → **Click to claim**. After claim,
`/__webmcp/page-state` shows `calls` that prove execution hit the document.

Smoke test:

```bash
node examples/mcp-api-adapter/cloudflare-claim/e2e-webmcp-bridge.mjs
```

Optional Core indexing of the same page:

```bash
clawql sources add http://127.0.0.1:8765 --kind webmcp --name "Challenge coupon"
```

This wraps a **local** third-party WebMCP page (polyfill when native WebMCP is
absent). It is **not** Cloudflare production and does not issue redeemable coupons.
