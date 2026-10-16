# Bun --smol RSS ladder (equal-arm host)

| Step | RSS |
| --- | ---: |
| empty `Bun.sleep` | 13 MB |
| `import "express"` | 37 MB |
| `import "effect"` | 40 MB |
| MCP streamableHttp SDK | 39 MB |
| `import "clawql-api"` | 88 MB |
| `import("./dist/server-http.js")` | 165 MB |
| listen Ready probe (`CLAWQL_HTTP_SKIP_PAYMENTS=1`, lazy `clawql-data`) | **~155 MB** (anon ~116 / file ~38) |
| Multiturn warm Ready / under-load (fat catalog, n=80 smoke) | ~290 / **~283 MB** |

Optional packages (payments, viem, graphql, mcp-grpc, inference, memory, ouroboros) and DuckDB are **unmapped** under skip — they are not the remaining anonymous budget after import. Multiturn still climbs when the fat catalog path runs.
