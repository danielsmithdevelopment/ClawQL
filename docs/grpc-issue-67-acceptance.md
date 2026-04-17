# gRPC MCP — P0 issue #67 acceptance vs shipped

This page maps [issue #67](https://github.com/danielsmithdevelopment/ClawQL/issues/67) (“Add gRPC transport side-by-side to the unified server”) to **what is implemented in this repo** so the issue can stay aligned with reality.

## Summary

Optional gRPC runs **in the same process** as Streamable HTTP when **`ENABLE_GRPC=1`**. The transport lives in **[`packages/mcp-grpc-transport`](../packages/mcp-grpc-transport/)**; **`clawql-mcp-http`** calls **`maybeStartGrpcMcpServer`** with the same **`createRegisteredMcpServer`** factory as HTTP ([`src/server-http.ts`](../src/server-http.ts)).

| Original acceptance item                                   | Status            | Where                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protobuf MCP + health + session streaming                  | Done              | [`packages/mcp-grpc-transport/proto/`](../packages/mcp-grpc-transport/proto/), [`server.ts`](../packages/mcp-grpc-transport/src/server.ts)                                                                             |
| Custom gRPC transport wired to `@modelcontextprotocol/sdk` | Done              | `mcp-grpc-transport` (`McpProtobufBridge`, `GrpcMcpSessionTransport`, …)                                                                                                                                               |
| Registration when **`ENABLE_GRPC`**                        | Done              | [`src/server-http.ts`](../src/server-http.ts) (`main` → `maybeStartGrpcMcpServer`)                                                                                                                                     |
| TLS / mTLS                                                 | Done (env-driven) | **`GRPC_TLS_CERT_PATH`**, **`GRPC_TLS_KEY_PATH`**, optional **`GRPC_TLS_CA_PATH`**, **`GRPC_TLS_REQUIRE_CLIENT_CERT`** — [package README — Environment](../packages/mcp-grpc-transport/README.md#environment)          |
| Basic e2e / grpcurl                                        | Done              | Package tests; [`src/grpc-memory-tools.test.ts`](../src/grpc-memory-tools.test.ts); [`scripts/grpc-memory-recall.mjs`](../scripts/grpc-memory-recall.mjs)                                                              |
| README, Dockerfile, Kustomize                              | Done              | Root [README](../README.md) (optional gRPC), [`docker/README.md`](../docker/README.md), [`docker/kustomize/`](../docker/kustomize/) (including [`overlays/grpc-enabled/`](../docker/kustomize/overlays/grpc-enabled/)) |
| No breakage to stdio / HTTP                                | Done              | gRPC is optional; default paths unchanged                                                                                                                                                                              |

## Service mesh and private networking

**mTLS at the application** is covered by **`GRPC_TLS_*`** (see above). **Service mesh** (Istio, Linkerd, Cloudflare, etc.) is **deployment-specific**: expose the **`grpc`** Service port (**50051**), route traffic to the pod, and use your mesh’s identity and policy. See [deploy-k8s.md — Service ports](deploy-k8s.md#service-ports-http-and-grpc) and the new subsection on TLS/mesh in that file.

## Langfuse / tracing

The issue text mentioned **Langfuse** in the same breath as README/Kustomize. **This repository does not embed Langfuse** or a tracing UI. Options:

- **gRPC:** pass **`grpcServerOptions`** into **`maybeStartGrpcMcpServer`** (e.g. **OpenTelemetry**-style **`interceptors`** per [package README — Observability](../packages/mcp-grpc-transport/README.md#background-clawql-and-the-python-reference)).
- **End-to-end LLM traces:** typically live in **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** or your client, not in `clawql-mcp` core.

If first-class Langfuse export from **`clawql-mcp-http`** is desired, track it as a **separate enhancement issue** (out of scope for closing #67).
