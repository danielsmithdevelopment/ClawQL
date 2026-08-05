# Codegraph impact rename

Rename the core pricing helper **`compute_total`** → **`compute_grand_total`**
across the whole call graph under `repo/`. Do **not** trust `decoy/` for the
impact set.

## Steps

1. Call **`codegraph_index`** with root pointing at `repo` (relative).
2. Use **`codegraph_query`** / **`codegraph_neighbors`** / **`codegraph_path`** /
   **`codegraph_explain`** to find the definition of `compute_total` and every
   caller / test that references it.
3. Rename the function and update **all** dependents (imports, calls, tests).
4. Write relative path `impact.json` listing every file you changed under `repo/`.

OpenCode tool names: `clawql_codegraph_index`, `clawql_codegraph_query`,
`clawql_codegraph_neighbors`, `clawql_codegraph_path`, `clawql_codegraph_explain`.

## Artifact

```json
{
  "old_name": "compute_total",
  "new_name": "compute_grand_total",
  "files": [
    "core/pricing.py",
    "…"
  ],
  "source": "codegraph"
}
```

`files` paths are relative to `repo/`. Order does not matter. Missing any real
caller or the test file fails the grader.

## Rules

- Ignore `decoy/` (it lists the wrong impact set).
- Leaving any `def compute_total` or call to `compute_total` under `repo/` fails.
- Grep/edit without real codegraph tool_use fails when evidence is required.
- Stop after the rename is complete and `impact.json` is written.
