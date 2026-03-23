# Phase 2 benchmark response examples

These JSON pairs power **`npm run benchmark:tokens`** when **`BENCHMARK_LIVE` is not set**
(or when live calls fail): **full REST-shaped** bodies vs **GraphQL-projected** bodies for the
same logical responses.

- **`fullRest`** — typical unfiltered REST JSON (many fields).
- **`graphql`** — same call with a lean field selection (what MCP `execute` returns through GraphQL).

They are **illustrative** (sizes tuned to show Phase 2 savings). With **`BENCHMARK_LIVE=1`**
and valid credentials, the script replaces them with **real** API responses when both REST and
GraphQL calls succeed.
