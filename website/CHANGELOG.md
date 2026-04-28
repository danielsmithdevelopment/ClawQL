# Changelog

## 2026-04-27

- **clawql-mcp v5.0.0** alignment: native **`CLAWQL_GRAPHQL_*`** / **`CLAWQL_GRPC_SOURCES`** (incl. offline SDL / introspection paths), bundled **`linear`** GraphQL SDL, OpenAPI→GraphQL vs REST vs native **`execute`** routing on **Home**, **Concepts**, **Tools**, **GraphQL layer**, **Spec configuration**, **Bundled specs**, **Quickstart**; repo **CHANGELOG** **[5.0.0]** and Helm **`0.5.0`** / **`appVersion` `5.0.0`**.

## 2026-04-24

- **clawql-mcp v4.1.0** site alignment: **Home** and **Tools** copy now describe optional **`ouroboros_*`** tools when **`CLAWQL_ENABLE_OUROBOROS=1`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); default merge blurb points to [spec configuration](/spec-configuration) instead of an outdated “top 50” list. Repo **CHANGELOG** and Helm chart **0.4.0** / **`appVersion` 4.1.0** match the release.

## 2026-04-23

- **Onyx knowledge search** page at **`/onyx-knowledge`**: optional MCP **`knowledge_search_onyx`** (**`CLAWQL_ENABLE_ONYX`**), **`ONYX_BASE_URL`**, tokens, JSON examples, links to **[onyx-knowledge-tool.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/onyx-knowledge-tool.md)** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)). **Navigation** → Reference; **Guides** grid; **sitemap**. **Tools**, **Bundled specs**, **Home**, **Concepts**, and **MCP clients** pages updated.
- **Ouroboros library** page at **`/ouroboros`**: documents workspace package **`clawql-ouroboros`** (evolutionary loop, install, imports, links to **[clawql-ouroboros.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/clawql-ouroboros.md)** for full examples). **Navigation** → Reference. **Tools** and **Concepts** pages cross-link.
- **Tools** page: **`memory_ingest`** row notes optional **`toolOutputsFile`** and **`CLAWQL_MEMORY_INGEST_FILE_*`**, linking to [mcp-tools memory_ingest](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp-tools.md#memory_ingest). **clawql-vault-memory** `SKILL.md` republished under **`/.well-known/agent-skills/`** from `.cursor/skills` (regenerated digest in **`agent-skills-index.json`**).

## 2026-04-21

- Site notes aligned with **clawql-mcp v4.0.0** (multi-spec defaults, bundled providers env, spec-configuration / bundled-specs copy).

## 2026-04-19

- Docs deploy (OpenNext + Cloudflare Worker `clawql-docs`); site content aligned with **clawql-mcp v3.4.1** (case studies, tools, caching headers).
- **Agent readiness:** `/.well-known` discovery (API catalog, OAuth/OIDC, protected resource, MCP server card, agent skills index), `/api/health`, **WebMCP** (`registerTool`), `prebuild` agent-skills generator.

## 2025-07-29

- Update to React 19 and Next.js 15.4

## 2025-04-28

- Update template to Tailwind CSS v4.1.4

## 2025-04-17

- Fix header opacity
- Organize imports
- Fix scrolling issues when navigating from the mobile nav ([#1387](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1387), [#1666](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1666))

## 2025-04-10

- Update template to Tailwind CSS v4.1.3

## 2025-03-22

- Update template to Tailwind CSS v4.0.15

## 2025-02-18

- Fix responsive design issue in footer

## 2025-02-10

- Update template to Tailwind CSS v4.0.6

## 2025-01-23

- Update template to Tailwind CSS v4.0

## 2024-11-01

- Fix code block rendering when no snippet language is specified ([#1643](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1643))

## 2024-08-08

- Configure experimental `outputFileTracingIncludes` for hosting on Vercel

## 2024-06-21

- Bump Headless UI dependency to v2.1
- Update to new data-attribute-based transition API

## 2024-06-18

- Update `prettier` and `prettier-plugin-tailwindcss` dependencies

## 2024-05-31

- Fix `npm audit` warnings

## 2024-05-07

- Bump Headless UI dependency to v2.0

## 2024-01-17

- Fix `sharp` dependency issues ([#1549](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1549))

## 2024-01-16

- Replace Twitter with X

## 2024-01-10

- Update Tailwind CSS, Next.js, Prettier, TypeScript, ESLint, and other dependencies
- Update Tailwind `darkMode` setting to new `selector` option
- Fix `not-prose` typography alignment issues
- Add name to MDX search function
- Sort classes

## 2023-10-03

- Add missing `@types/mdx` dependency ([#1512](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1512))

## 2023-09-07

- Added TypeScript version of template

## 2023-08-15

- Bump Next.js dependency

## 2023-07-31

- Port template to Next.js app router

## 2023-07-24

- Fix search rendering bug in Safari ([#1470](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1470))

## 2023-07-18

- Add 404 page
- Sort imports and other formatting

## 2023-05-16

- Bump Next.js dependency

## 2023-05-15

- Replace Algolia DocSearch with basic built-in search ([#1395](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1395))

## 2023-04-11

- Bump Next.js dependency

## 2023-03-29

- Bump Tailwind CSS and Prettier dependencies
- Sort classes

## 2023-03-22

- Bump Headless UI dependency

## 2023-02-15

- Fix scroll restoration bug ([#1387](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1387))

## 2023-02-02

- Bump Headless UI dependency

## 2023-01-16

- Fixes yarn compatibility ([#1403](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1403))
- Bump `zustand` dependency

## 2023-01-07

- Enable markdown table support in using `remark-gfm` plugin ([#1398](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1398))
- Fix SVG attribute casing ([#1402](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1402))

## 2023-01-03

- Fix header disappearing in Safari ([#1392](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1392))

## 2022-12-17

- Bump `mdx-annotations` dependency

## 2022-12-16

- Fix scroll jumping issue with Dialog in Safari ([#1387](https://github.com/tailwindlabs/tailwind-plus-issues/issues/1387))
- Update "API" item in header navigation link to home page
- Bump Headless UI dependency

## 2022-12-15

- Initial release
