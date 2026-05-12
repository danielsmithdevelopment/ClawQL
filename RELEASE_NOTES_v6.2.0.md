## clawql-mcp 6.2.0

**npm:** [clawql-mcp@6.2.0](https://www.npmjs.com/package/clawql-mcp)  
**gRPC transport:** [mcp-grpc-transport@0.2.0](https://www.npmjs.com/package/mcp-grpc-transport)  
**Full changelog:** [CHANGELOG.md#620---2026-05-12](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#620---2026-05-12)

### Highlights

- **MCP gRPC for large tool payloads:** **`mcp-grpc-transport` 0.2.0** merges default **64 MiB** gRPC send/receive limits in **`maybeStartGrpcMcpServer`**, exports **`callToolServerStreamingGrpc`** and helpers for protobuf **`CallTool`** clients. Helm **`enableGrpc`** defaults **`true`**; **`grpcMaxMessageLength`** sets **`GRPC_MAX_MESSAGE_LENGTH`**.
- **REST `execute`:** only declared query parameters are appended (fewer **414** / URL-length failures).
- **Streamable HTTP:** **`CLAWQL_MCP_JSON_BODY_LIMIT`** for larger JSON-RPC bodies.
- **`execute`:** REST-first when upstream **`Content-Type`** is **`application/octet-stream`**.

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.4`**, **`appVersion` `6.2.0`** (aligns with npm).

### Install

```bash
npm install clawql-mcp@6.2.0
npm install mcp-grpc-transport@0.2.0
```

**Node:** `>=22` (see `package.json` `engines`).
