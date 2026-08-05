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

## Hints

When ClawQL **codegraph** tools are available (`codegraph_index`,
`codegraph_query`, `codegraph_neighbors`, `codegraph_path`,
`codegraph_explain`), use them to discover dependents of
`getWidgetById` / `handler.js` instead of guessing. Index with
`root` = `.` (workspace root). Do not leave orphan handler code that
nothing routes to.

## Done when

`node --test tests/widgets.test.js` passes and the OpenAPI path exists.
