# Fan-out real-model session (template)

You are a blind Cursor Task for the Cloudflare fan-out / join real-model gate.

## Fixed paths

- STATE=`/tmp/cf-mt-fanout-gate`
- MCP URL: `$(cat /tmp/cf-mt-fanout-gate/mcp-url)`
- Fixture: `/tmp/cf-mt-fanout-gate/fixture-hint.json`
- Known ops (no where): `/tmp/cf-mt-fanout-gate/fanout-known-ops.json`
- Schemas: `execute-tool-schema.json`, `execute-program-tool-schema.json` under STATE
- CLI: `node /workspace/scripts/benchmarks/cloudflare-multiturn/lib/real-model-mcp-cli.mjs`

Always:

```bash
export CF_MT_REAL_MCP_URL=$(cat /tmp/cf-mt-fanout-gate/mcp-url)
export CF_MT_REAL_CODE_PARITY=execute_args
```

FORBIDDEN: reading `fanout-join-shapes.mjs`, `published-scripts.mjs`, other sessions, or any file containing expected `where` strings / the inventory gold card.

## Inventory card fields

`ssl`, `aRecordCount`, `workers` (sorted ids), `routesForWorkers` (routes whose `script` ∈ workers, sorted by script then pattern), `bucketNames` (sorted), `enabledFirewallRules`

## Arms

### clawql_known_op

1. Read known ops JSON.
2. For each of the six ops, call `execute` with `operationId`, `args`, and a JMESPath `where` you invent (use execute schema examples).
3. Join workers∩routes yourself into `routesForWorkers`.
4. Write the card to `sessions/<model>/<arm>/session-<N>.json`.
5. Set `CF_MT_REAL_CALL_LOG` to `sessions/<model>/<arm>/session-<N>-calls.jsonl` for every CLI call.
6. `definitionTokens` = token count of `execute-tool-schema.json` (use `js-tiktoken` cl100k_base or approximate from `wc` via a tiny node one-liner).
7. Meta: `{ok, turns: <execute rounds>, definitionTokens, whereAttempts, whereMalformed, toolErrors, cheated:false, notes, failed:[]}`.
8. Run `node …/check-fanout-real-session.mjs` on the card; set `ok` from that.

### clawql_program

1. One `execute_program` call. Prefer the compact form from the tool schema:
   `{"return":true,"calls":[{"operationId":"…","args":{},"where":"{field: …}"}]}`
   Omit `v` / `mode` / `tool` when defaults work. Keep the plan short — code tokens are 5× weighted.
2. Give each call an `id` if `where` returns a scalar/array (merge wraps under that id), or use object `where` projections with distinct keys.
3. Card = tool result (compact return) written to `session-<N>.json`.
4. `definitionTokens` from `execute-program-tool-schema.json`; `turns: 1` if one program call.
5. Same meta + check pattern.

## Return

Brief JSON: `{model, arm, session, ok, turns, notes}` per session completed.
