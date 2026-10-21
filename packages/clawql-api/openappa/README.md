# OpenAPPA Layer 5 (ClawQL battery)

ClawQL wires [OpenAPPA](https://github.com/archestra-ai/OpenAPPA) as **Layer 5 — information-flow policy**, after **Panguard (Layer 4)** at the MCP tool wrap choke point.

| Layer | Engine | Question |
| --- | --- | --- |
| 4 | Panguard / ATR | May this tool run? |
| 5 | OpenAPPA | May *this labeled data* go *there*? |

Session IFC (`mayFlow`) remains the in-gateway stand-in when OpenAPPA is off.

## Opt-in

```bash
export CLAWQL_ENABLE_OPENAPPA=1
export CLAWQL_OPENAPPA_URL=http://127.0.0.1:8789
# optional:
# CLAWQL_OPENAPPA_ADAPTER=opencode   # default (mcp__clawql__* spelling)
# CLAWQL_OPENAPPA_MCP_SERVER=clawql
# CLAWQL_OPENAPPA_FAILURE_POLICY=block  # or warn
# CLAWQL_OPENAPPA_TIMEOUT_MS=5000
```

## Sidecar

```bash
appa runtime --adapter opencode --listen 127.0.0.1:8789 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa.db
```

Policy: [`batteries/clawql/appa.toml`](./batteries/clawql/appa.toml). Undeclared tools are refused (`undeclared_tool`). Attention requirements map to ClawQL `mandate_required`.

## Wire order

`wrapRegisteredMcpToolHandler` → Panguard (`runMcpProxyBeforeCallTool`) → **OpenAPPA `tool_call`** → session IFC / handler → **OpenAPPA `tool_result`**.
