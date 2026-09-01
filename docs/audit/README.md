# Audit in ClawQL

Two different things share the word “audit”:

| Surface                                                  | What it is                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP **`audit`** (`clawql-core`)                          | **Shipped.** In-process **hash-chained** ring buffer. Droppable, clearable, RAM-only. `verify` checks the retained window. Not a compliance WORM trail. |
| [`clawql-audit-spec-v0.1.md`](clawql-audit-spec-v0.1.md) | **Canonical v0.1.** `clawql-merkle` + `clawql-audit` Effect trail. Local durability is **sql.js SQLite** + dual-ack outbox. S3/HTTP/QR/TEE still spec.  |

**Related:** [MCP `audit` tool](../mcp/mcp-tools.md) · [Enterprise MCP tools](../mcp/enterprise-mcp-tools.md) · [TEE air-gap QR](../streams/clawql-tee-airgap-audit.md) · [celld LTX WORM](../streams/clawql-celld.md) · [clawql-agents spec](../agents/clawql-agents-spec-v0.1.md)
