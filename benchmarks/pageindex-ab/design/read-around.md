# Precondition: `read_around` for Arms B / C / E / E−

Arms B and C (and hybrid arms that cite sections) need a way to expand a chunk hit into the **shared Docling section** used by the answer contract. PageIndex already has `pageindex_get_content({ docId, nodeId })`; vector/vault hits do not.

## Contract (proposed)

```json
{
  "name": "read_around",
  "arguments": {
    "document_id": "string",
    "section_id": "string",
    "chunk_id": "string (optional)",
    "token_budget": 1200
  }
}
```

Returns `{ section_id, title, content, truncated }` from the **same** section map every arm cites. Prefer harness-local registration for the eval if product MCP is not ready; promote to `clawql-memory` only if Outcome 1 or 2 needs it in production.

## Non-goals for v1

- Neighbor-window sliding across arbitrary char offsets (nice-to-have; section ID is enough for citation PRF).
- Building a second section ontology separate from Docling — one map only.
