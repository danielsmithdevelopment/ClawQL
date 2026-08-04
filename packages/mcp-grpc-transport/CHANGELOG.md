# Changelog

All notable changes to **mcp-grpc-transport** are documented here. This package is versioned independently of the [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) monorepo app.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-04

### Added

- **MCP 2026-07-28 (stateless core)** — accept protocol version `2026-07-28` on `mcp-protocol-version` metadata alongside SDK versions (`2025-11-25` … `2024-10-07`).
- **`Discover` RPC** — capability discovery without initialize/session handshake; returns `stateless`, server identity, and capabilities.
- **Per-request client info** — optional gRPC metadata `mcp-client-info` (JSON `{ name, version }`) for 2026-07-28 clients.
- Public exports: `LATEST_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `MCP_PROTOCOL_VERSION_2026_07_28`, `isStatelessProtocolVersion`, `checkMcpProtocolVersion`.

### Changed

- Package version **1.0.0** — production TypeScript gRPC MCP transport aligned with Anthropic’s 2026-07-28 stateless protocol announcement.
- Default client protocol version preference: **2026-07-28**.

### Documentation

- README: 1.0 / stateless MCP / Discover / Agentic Fabric edge↔VG notes.

## [0.2.0] - 2026-05-12

### Added

- **`callToolServerStreamingGrpc`**, **`lastNonEmptyCallToolText`**, **`mcpArgumentsToCallToolStructFields`**, **`resolveGrpcAddressFromEnv`**, **`resolveGrpcMaxMessageLengthFromEnv`** (`grpc-call-tool-client.ts`) for protobuf **`CallTool`** clients with nested Struct args.
- **`defaultGrpcServerMessageSizeBytes`** and merged default **`grpc.max_receive_message_length` / `grpc.max_send_message_length`** (64 MiB; override via **`GRPC_MAX_MESSAGE_LENGTH`**) in **`maybeStartGrpcMcpServer`**.

## [0.1.2] - 2026-04-16

### Fixed

- **Reflection descriptors:** patch **`@grpc/proto-loader`** **`FileDescriptorProto`** output used for **`grpc.reflection.v1.ServerReflection`** so **`grpcurl list`** / **`jhump/protoreflect`** resolve map entry types (**`…Entry`**), cross-package **`type_name`** (leading dot), and **`google/protobuf`** dependencies.

### Added

- **`src/proto-loader-reflection-patch.ts`** and **`proto-loader-reflection-patch.test.ts`**; **`mcp-protobuf-struct.test.ts`**.

### Documentation

- README **Kubernetes:** ClawQL **`clawql-mcp-http`** Service exposes **50051** in all Kustomize overlays; link to ClawQL **`docs/deployment/deploy-k8s.md`**.

## [0.1.1] - 2026-04-18

### Fixed

- **`structToJson`:** `google.protobuf.Struct.fields` may be a JavaScript **`Map`**. Using **`Object.entries`** on a **`Map`** yields no rows, so tool arguments (for example **`memory_recall`** `query`) decoded to **`{}`** and validation failed with **expected string, received undefined**. Struct decoding now iterates **`Map`** entries as well as plain objects.

### Documentation

- README: **Testing and invoking MCP over gRPC** — `mcp-protocol-version` metadata, package tests, **grpcurl** examples (health, reflection, `ListTools`), **grpcurl** + `google.protobuf.Value` formatting caveat, **`@grpc/grpc-js`** sample, ClawQL dual-port note.
- README: **`memory_recall` over gRPC** — `CallTool` + **`google.protobuf.Struct`**; ClawQL **`scripts/dev/grpc-memory-recall.mjs`** (protobufjs encoding) when proto-loader clients drop nested **`Value`** fields.

## [0.1.0] - 2026-04-16

First **npm** release: pluggable gRPC transport for MCP on Node using [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

### Included

- **`grpc.health.v1.Health`** — `Check` / `Watch` for probes and meshes.
- **`model_context_protocol.Mcp`** — protobuf unary/streaming RPCs aligned with the [community Python gRPC reference](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc); **`mcp-protocol-version`** metadata on those RPCs.
- **`mcp.transport.v1.Mcp.Session`** — optional bidi stream of JSON-RPC (`JsonRpcLine`) for clients that prefer the stdio-style wire.
- **`maybeStartGrpcMcpServer`**, **`GrpcMcpSessionTransport`**, health FQN helpers, TLS/reflection env wiring, and **`dependent_requests`** client helpers (`runUnaryWithDependents`, `fulfillDependentRequests`, …). See the [README](README.md).

There are **no earlier published versions** of this package on npm.
