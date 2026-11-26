# `read_around` — shipped MCP tool

Registered by `clawql-memory` (with memory tier). Expands a path/chunk hit into the enclosing ATX heading section — shared section ids for pageindex-ab citation PRF.

## Contract

```json
{
  "name": "read_around",
  "arguments": {
    "path": "Memory/handbook.md",
    "sectionId": "sec-protocols",
    "chunkText": "optional snippet from a recall hit",
    "tokenBudget": 1200
  }
}
```

Or pass `markdown` inline (eval harness) instead of `path`.

Returns `{ ok, section_id, title, content, truncated, sections_available }`.

## Implementation

- `packages/clawql-memory/src/recall/read-around.ts`
- Effect service `ReadAroundService`
- Plugin registration in `memory-plugin.ts`

## Non-goals (still)

- Neighbor-window sliding across arbitrary char offsets
- Auto-fusing Docling JSON section maps (heading slug ids are the v1 contract; Docling id alias table can layer later)
