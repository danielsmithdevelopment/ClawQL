# Add GET /widgets/:id API surface (codegraph)

This TypeScript/Node package is a tiny HTTP API. Product wants a new
**`GET /widgets/:id`** endpoint. The handler stub already exists, but the
change is incomplete across the dependency graph.

## Required changes (impact set)

You must update **all** of these files so the feature is wired end-to-end:

1. `src/handler.js` — implement `getWidgetById(id)` (return widget or `null`)
2. `src/router.js` — register `GET /widgets/:id` → handler
3. `src/schema.js` — export `WidgetParams` / validate id as non-empty string
4. `openapi/openapi.yaml` — document the path + 200/404 responses
5. `tests/widgets.test.js` — cover found + not-found cases

Also update `src/index.js` only if needed to re-export the router.

## How to work (hard rules)

1. **Edit files yourself** with the write/edit tools. Do **not** delegate the
   implementation to the OpenCode `task` / explore subagent — that skips grading.
2. When ClawQL **codegraph** tools are available, call them **before** editing:
   - `clawql_codegraph_index` with **`root` / `rootPath` = `.`** (workspace root
     only — never `/` or a host absolute path outside this package)
   - then `clawql_codegraph_query` / `neighbors` / `path` for `getWidgetById`
     / `handler.js` / `router.js`
3. Finish every file in the impact set, then run
   `node --test tests/widgets.test.js`.

## Done when

`node --test tests/widgets.test.js` passes and the OpenAPI path exists.
