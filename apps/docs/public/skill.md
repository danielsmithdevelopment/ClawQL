---
name: clawql-docs
description: >-
  Use ClawQL docs and MCP tools — search then execute OpenAPI operations,
  optional vault memory, self-host via npx clawql-mcp.
---

# ClawQL agent skill

## When to use

- Connecting an IDE or agent host to ClawQL MCP (`search`, `execute`, memory tools)
- Finding install, auth, OpenAPI, or protocol-fabric docs

## Install

```bash
npx clawql-mcp
npx -p clawql-mcp clawql-mcp-http
```

## Canonical URLs

- Docs: https://docs.clawql.com
- Getting started: https://docs.clawql.com/getting-started
- MCP tools: https://docs.clawql.com/mcp/mcp-tools
- OpenAPI: https://docs.clawql.com/openapi.json
- llms.txt: https://docs.clawql.com/llms.txt
- Skills index: https://docs.clawql.com/.well-known/agent-skills/index.json
- Marketing: https://clawql.com · https://clawql.com/llms.txt

## Workflow

1. Read https://docs.clawql.com/llms.txt (or llms-full.txt) for the index.
2. Prefer `search` before `execute` for unknown operationIds.
3. For consequential writes, expect mandate / preview flows documented under risk specs.
