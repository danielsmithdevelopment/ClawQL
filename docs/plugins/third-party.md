---
title: Third-party plugins
description: Roadmap for publishing clawql-* npm plugins that depend on clawql-core and clawql-api. Extension checklist for authors.
slug: third-party
status: roadmap
package: npm (clawql-*-plugin)
order: 12
prev: hitl-label-studio
next:
---

# Third-party plugins

ClawQL is moving toward a **plugin registry** model where horizontal features ship as composable `Plugin` implementations. Third-party npm packages are on the roadmap — the public registration API is not frozen yet.

## Target contract

1. Publish **`clawql-yourname-feature`** depending on **`clawql-core`** + **`clawql-api`** (not `clawql-mcp` transport).
2. Export a **`Plugin`** factory (eventually an Effect **`Layer`**).
3. Implement **`onRegister`** to register MCP tools and declare **`requiredSpecs`**.
4. Document the Operator toggle or **`CLAWQL_ENABLE_*`** flag.
5. Open a PR to add a row to the [plugin registry](/reference/plugins).

## Until the API stabilizes

- Contribute in-repo under `packages/` or `providers/`
- Use **`CLAWQL_BUNDLED_PROVIDERS`** for custom API merges
- Vertical-specific behavior may land under `verticals/clawql-*` — see [Verticals guide](/reference/verticals)

## Learn more

- [Plugin model & registry](/reference/plugins)
- [Contributor technical specification](/contributing/technical-specification)
- [Modularization v2.1](/vision/modularization)
