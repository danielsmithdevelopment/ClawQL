# Changelog

All notable changes to **mcp-grpc-transport** are documented here. This package is versioned independently of the [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) monorepo app.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-16

First **npm** release: pluggable gRPC transport for MCP on Node using [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

### Included

- **`grpc.health.v1.Health`** — `Check` / `Watch` for probes and meshes.
- **`model_context_protocol.Mcp`** — protobuf unary/streaming RPCs aligned with the [community Python gRPC reference](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc); **`mcp-protocol-version`** metadata on those RPCs.
- **`mcp.transport.v1.Mcp.Session`** — optional bidi stream of JSON-RPC (`JsonRpcLine`) for clients that prefer the stdio-style wire.
- **`maybeStartGrpcMcpServer`**, **`GrpcMcpSessionTransport`**, health FQN helpers, TLS/reflection env wiring, and **`dependent_requests`** client helpers (`runUnaryWithDependents`, `fulfillDependentRequests`, …). See the [README](README.md).

There are **no earlier published versions** of this package on npm.
