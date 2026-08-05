# Codegraph-guided symbol locate

Find where `SECRET_MARKER` is defined under `repo/` using structural codegraph
tools — not by trusting `decoy/`.

## Steps

1. Call **`codegraph_index`** with root pointing at `repo` (relative).
2. Call **`codegraph_query`** (or `codegraph_explain` / `codegraph_neighbors`)
   for `SECRET_MARKER` or `format_line` / ledger.
3. Write relative path `answer.json`.

OpenCode names: `clawql_codegraph_index`, `clawql_codegraph_query`,
`clawql_codegraph_neighbors`, `clawql_codegraph_explain`.

## Artifact

```json
{
  "marker": "<SECRET_MARKER string value>",
  "file": "payments/ledger.py",
  "source": "codegraph"
}
```

`file` may be a suffix path containing `payments/ledger.py`.

## Rules

- Ignore `decoy/` (claims the marker is in app.py).
- Grep/read alone without codegraph tool_use fails the grader.
- Stop after writing `answer.json`.
