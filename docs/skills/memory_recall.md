# Skill: `memory_recall`

Retrieve relevant prior context before making changes or claims. Prefer **`memory_recall`** as the entry facade; use specialist tools when `followUps` recommend them.

## When to Use

- Start of a complex task.
- User references previous work.
- You need decisions/history not in current files.
- Multi-source context: vault + vectors + codegraph + PageIndex + Onyx via `sources`.

## Common Workflow

1. Query with concrete terms (feature, incident code, component).
2. Optionally set `sources`: `["vault","vector","codegraph","pageindex","onyx"]`.
3. Start with low `limit` (5-10).
4. Increase `maxDepth` when wikilink context matters.
5. Prefer normalized **`hits[]`**; keep using **`results`** if needed for vault-only paths.
6. Follow **`followUps`** only when you need path / synthesize / filtered Onyx.
7. Summarize before acting.

## Patterns

### Pattern A: Resume prior implementation

- Query: feature name + issue id + subsystem
- Default sources (vault + vector)

### Pattern B: Architecture + narrative

```json
{
  "query": "AuthService billing path",
  "sources": ["vault", "codegraph"],
  "maxDepth": 2
}
```

### Pattern C: Long-doc + enterprise

```json
{
  "query": "rate limit policy",
  "sources": ["vault", "pageindex", "onyx"]
}
```

### Pattern D: Code structure + narrative

1. Ensure repo is indexed (`codegraph_index` or Graphify import).
2. `memory_recall` with `sources: ["vault","codegraph"]` (or includeCodeGraph / hybrid env).
3. Use vault snippets for _why_ and codegraph hits for _where_ in source.

## Tips

- Use multiple focused recalls rather than one broad query.
- Distinguish vault/link hits from codegraph/pageindex/onyx in `hits[].source`.
- Pair with `memory_ingest` + optional `rebuild.pageindex` after finishing work.

## Composed Workflow

1. `memory_recall` (optional `sources`)
2. Specialist tools from `followUps` if needed
3. `search` / `execute`
4. `memory_ingest` with decisions, wikilinks, and citations
