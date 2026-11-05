# MCP HTTP session membership (TLA+)

`McpHttpSession.tla` — Streamable HTTP transport map membership + capacity.

| Config                   | `WeakSkipCapacityCheck` | Expect                                   |
| ------------------------ | ----------------------- | ---------------------------------------- |
| `McpHttpSession.cfg`     | `FALSE`                 | **PASS** — `activeCount ≤ MaxSessions`   |
| `McpHttpSessionWeak.cfg` | `TRUE`                  | **COUNTEREXAMPLE** — initialize past max |

```bash
scripts/formal/run-mcp-http-session-tlc.sh
```

Code: `src/http/mcp-http-session-transition.ts`  
wired into `mcp-http-server.ts` (initialize / close / touch) and `mcp-session-idle.ts` (IdleEvict).
