# Click-to-claim · Cloudflare production WebMCP → `/mcp-ui`

Wraps Cloudflare’s live WebMCP challenge page and turns the hidden tool into a
human **Click to claim** button.

**Production page:** https://webmcp-challenge.examples.workers.dev/

That page registers `reveal_extra_credits_link` on `document.modelContext`. Calling
it opens the dialog with the real **extra $10 Cloudflare credits** redeem URL.
ClawQL opens the page over Chrome CDP, proxies the tool as MCP, and `/mcp-ui`
re-surfaces it as a human button — coupon/credits logic stays on Cloudflare’s page.

```text
[ webmcp-challenge.examples.workers.dev ]
  document.modelContext.registerTool(reveal_extra_credits_link)
        ↑ CDP (+ WebMCP polyfill if native API absent)
[ Chrome --remote-debugging-port ]
        ↑
[ cloudflare-claim-server.mjs ]  thin MCP proxy
        ↑ gRPC
[ mcp-api-adapter /mcp-ui ]
  presets/cloudflare-claim → claim-button → redeem URL
```

## Run (production claim)

```bash
npm run build -w mcp-grpc-transport -w mcp-api-adapter
node examples/mcp-api-adapter/cloudflare-claim-server.mjs
```

Defaults:

- `WEBMCP_PAGE_URL=https://webmcp-challenge.examples.workers.dev/`
- Human UI: http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim
- Probe: http://127.0.0.1:8765/__webmcp/page-state (shows `redeemUrl` after claim)

Walk the preset / press **Click to claim**. The tool result includes Cloudflare’s
`redeemUrl` (cf-for-startups-redeem.pages.dev …) — that is the real $10 credits link.

Smoke:

```bash
node examples/mcp-api-adapter/cloudflare-claim/e2e-webmcp-bridge.mjs
```

## Local mirror (optional)

```bash
WEBMCP_PAGE_URL=http://127.0.0.1:8765/ node examples/mcp-api-adapter/cloudflare-claim-server.mjs
```

Serves `site.html` with demo `cf_*` tools. Not needed for the recording.

## Core index (optional)

```bash
clawql sources add https://webmcp-challenge.examples.workers.dev/ --kind webmcp \
  --name "CF WebMCP challenge"
```
