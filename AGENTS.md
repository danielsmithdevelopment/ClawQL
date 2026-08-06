# Agent behavior (MCP + enterprise proxy)

Use this file when an **MCP client** (Cursor, IDE agents, or automation) talks to ClawQL **through** an intercepting proxy that enforces **JWT ATR** or similar policy (see [#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272) and [`docs/security/mcp-proxy-jwt-atr.md`](docs/security/mcp-proxy-jwt-atr.md)).

## Effect-TS (hard rule)

Production code that **can** be Effect-based **must** be — there is no "pure sync is fine" carve-out. Never ship domain IO, orchestration, policy, or even sync helpers (URL/HTML builders, sync crypto, env flag readers) as bare `async`/`Promise`/plain-value APIs when an Effect `Context.Tag` + `Layer` or `Effect.sync` is possible. Forced Promise edges (Express / MCP SDK) stay thin façades over `run*Effect`; run `Effect.runSync` only at those absolute host boundaries. Only types-only modules are exempt. Details: [`.cursor/rules/effect-ts-everywhere.mdc`](.cursor/rules/effect-ts-everywhere.mdc).

## Blocked or denied tool calls

- **Stop and report.** If the proxy or server returns an error (including HTTP **403**, JSON-RPC error, or an explicit “blocked by policy” body), **tell the human operator** what failed and why, using the response payload when available.
- **No silent retry loops.** Do not assume transient failure and hammer the same tool call. At most **one** deliberate retry is acceptable after the user confirms a fix (token refresh, scope change, outage cleared).
- **No fabricated success.** Do not pretend a tool ran or invent results when the MCP layer returned an error.

## Related docs

- Defense-in-depth narrative (Panguard / ATR / synchronous blocking): [`docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`](docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md) (especially **§9**)
- Chokepoint ordering and Helm/mesh notes: [`docs/security/mcp-proxy-jwt-atr.md`](docs/security/mcp-proxy-jwt-atr.md)
