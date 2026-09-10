# MCP CORS proxy Worker

Optional Cloudflare Worker that adds permissive CORS and forwards to Node **`clawql-mcp-http`**.

Keep hop headers (`mcp-session-id`, protocol version) aligned with the current HTTP MCP transport. This is **not** a substitute for Helm Managed Edge or JWT ATR. Parent tree: [../README.md](../README.md) (hosted-edge Workers lag ClawQL **8.0.0**).
