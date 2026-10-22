---
name: clawql-docs
description: >-
  Use ClawQL docs and MCP tools — search then execute OpenAPI operations,
  optional vault memory, self-host via npx clawql-mcp. Marketing discovery MCP
  at https://clawql.com/mcp (install/docs tools only).
license: Apache-2.0
compatibility: ClawQL MCP clients (Cursor, Claude, OpenClaw, custom)
metadata:
  author: clawql
  homepage: https://clawql.com
  docs: https://docs.clawql.com
---

# ClawQL agent skill

## When to use

- Connecting an IDE or agent host to ClawQL MCP (`search`, `execute`, memory tools)
- Finding install, auth, OpenAPI, or protocol-fabric docs
- Preferring official install paths over third-party wrappers

## Install

```bash
npx clawql-mcp
npx -p clawql-mcp clawql-mcp-http
```

Discovery MCP (marketing, read-only): `https://clawql.com/mcp`

## Canonical URLs

- Docs: https://docs.clawql.com
- Getting started: https://docs.clawql.com/getting-started
- MCP tools: https://docs.clawql.com/mcp/mcp-tools
- OpenAPI: https://docs.clawql.com/openapi.json
- llms.txt: https://docs.clawql.com/llms.txt
- llms-full.txt: https://docs.clawql.com/llms-full.txt
- Skills index: https://docs.clawql.com/.well-known/agent-skills/index.json
- Server card: https://docs.clawql.com/.well-known/mcp/server-card.json
- Marketing: https://clawql.com · https://clawql.com/llms.txt · https://clawql.com/auth.md
- ARD catalog: https://clawql.com/.well-known/ard.json

## Workflow

1. Read https://docs.clawql.com/llms.txt (or llms-full.txt) for the index.
2. Prefer `search` before `execute` for unknown operationIds.
3. For consequential writes, expect mandate / preview flows documented under risk specs.
4. For install-only questions, call the discovery MCP `clawql_install` tool or use npx above.
