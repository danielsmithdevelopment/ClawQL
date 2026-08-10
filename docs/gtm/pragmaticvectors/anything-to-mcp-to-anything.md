---
canonical: https://pragmaticvectors.com/posts/anything-to-mcp-to-anything/
meta-description: ClawQL is agentic infrastructure. It handles protocol translation, memory, documents, security, streaming, and fine-tuning in one system.
---

AgentsAugust 2026 · ~5 min read

# Anything to MCP. MCP to anything.

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

- [Agents](https://pragmaticvectors.com/tags/agents)
- [MCP](https://pragmaticvectors.com/tags/mcp)
- [Infrastructure](https://pragmaticvectors.com/tags/infrastructure)

---

ClawQL is infrastructure for agents that do real work in production. It handles protocol translation, memory, documents, security, streaming, and fine-tuning in one system.

The protocol translation layer runs in both directions. ClawQL Core takes any API surface and makes it callable as an MCP tool — REST, GraphQL, gRPC, WebSocket, native MCP servers, a generated CLI, a QR stream from an air-gapped system. mcp-api-adapter runs the other direction. It takes any MCP server and exposes its tool catalog as any surface a consumer needs: REST, GraphQL, gRPC, WebSocket, native MCP, a generated CLI, a QR stream for maximum security environments.

A gRPC service talks to a GraphQL consumer. A WebSocket stream becomes a REST endpoint. Protocol to protocol, in any direction, with MCP as the common layer.

---

## Memory

ClawQL vault memory persists decisions, findings, and runbooks across sessions and agents. `memory_ingest` writes structured Markdown with wikilinks. `memory_recall` retrieves it with keyword search, wikilink graph traversal, vector search, and structured predicate filters for exact field matching.

The ontology layer extends this further. Domain schemas define typed fields for entities in your industry. Legal matters, lending applications, government programs. Queries run as predicate evaluation against a typed index without reading every document in sequence.

---

## Documents

The IDP pipeline processes documents before agents touch them. Multiple vendors available: pdf-inspector classifies PDFs and routes scanned pages to OCR, Docling handles layout-aware extraction for forms and complex layouts, Gotenberg normalizes files to PDF, Stirling redacts PII and splits or merges files, and Onyx indexes the results for hybrid search. Agents that read processed documents get structured, redacted, indexed content not raw files.

---

## Streams

A ClawQL Streams `stream_subscribe` call points at any event source: a WebSocket feed, a NATS subject, a webhook, a cron schedule, an API polled on an interval, a QR stream from an air-gapped system. When an event comes in, a significance filter decides whether to wake an agent. The agent runs, uses the full ClawQL tool surface, writes its findings to the WORM audit trail, and goes back to listening. The event source fires. The agent acts. No human starts the session.

---

## Security

ATR scoping limits what each agent can call. An agent declared with access to memory and search cannot call execute regardless of what the prompt says. Panguard enforces this at tool call time. Fail-closed means a policy deny is the default when scope is unclear.

Cosign-signed container images. Kyverno k8s admission enforcement. OSV-Scanner and Trivy gates in CI. A working system with verifiable controls.

For regulated environments there is clawql-tee. It is a fully DO-compatible runtime that supports AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. Hardware attestation proves what software is running. Vault only releases secrets after attestation verification. GPU confidential computing keeps model weights and inference inputs away from the host. The audit trail leaves the trusted execution environment through a QR optical channel — fountain codes, ChaCha20 encryption, HMAC per symbol, Merkle verification of the reconstructed payload. A camera on the outside scans what the screen inside shows. No network path crosses the boundary.

---

## The training flywheel

Every agent session produces a trace. ClawQL captures these as RTP records with structured, schema-typed, provenanced training data. Passing traces become SFT training data. Paired passing and failing traces on the same task become DPO training pairs. Verifiable reward functions feed GRPO directly.

Better sessions produce better traces. The dataset grows. The next fine-tune starts from a larger, higher-quality base. The agents that run on ClawQL generate the data that makes them better.

---

## Open source

Apache 2.0. Self-host free. The full stack runs on your hardware with no license fee.

[Start free trial](https://clawql.com/signup/) · [Self-host free](https://docs.clawql.com/readme/getting-started) · [GitHub](https://github.com/danielsmithdevelopment/ClawQL)
