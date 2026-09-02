# Click-to-claim · third-party WebMCP → `/mcp-ui`

Protocol Fabric demo: a third-party site exposes agent-facing coupon tools via
WebMCP; ClawQL re-surfaces the claim as a human **Click to claim** button.

```text
[ challenge site :8765 ] --WebMCP--> agents
                \
                 \-- MCP mirror --> mcp-api-adapter /mcp-ui
                                   presets/cloudflare-claim
                                   customHtml: claim-button
```

## Run

```bash
npm run build -w mcp-grpc-transport -w mcp-api-adapter
node examples/mcp-api-adapter/cloudflare-claim-server.mjs
```

- Third-party page: http://127.0.0.1:8765/
- Human UI: http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim

Walk the preset: **Start** → reveal challenge → **Click to claim**.

Optional live indexing (requires Chromium WebMCP + CDP):

```bash
clawql sources add http://127.0.0.1:8765 --kind webmcp --name "Challenge coupon"
```

This is a **local mock** of the Cloudflare-style agent coupon pattern — not Cloudflare production.
