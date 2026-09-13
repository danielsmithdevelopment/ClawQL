/**
 * Starter pack payload for WebMCP `clawql.docs.claim_starter_pack`.
 * Secrets never belong in mcp.json — only paths / home env.
 */

export const STARTER_MCP_JSON = `{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-p", "clawql-mcp", "clawql-mcp"],
      "env": {
        "CLAWQL_HOME": "\${HOME}/.ClawQL",
        "CLAWQL_OBSIDIAN_VAULT_PATH": "\${HOME}/.ClawQL"
      }
    }
  }
}
`

export const STARTER_README = `# ClawQL starter pack (WebMCP unlock)

Generated from docs.clawql.com via \`clawql.docs.claim_starter_pack\`.

## 1. Install / run gateway

\`\`\`bash
# Empty catalog by default in 8.0+ (opt in providers as needed)
npx -p clawql-mcp clawql-mcp

# Opinionated default stack (optional)
CLAWQL_PROVIDER=default npx -p clawql-mcp clawql-mcp
\`\`\`

Or scaffold home + vault:

\`\`\`bash
npx -p clawql-mcp clawql init --interactive
\`\`\`

## 2. Wire Cursor / MCP client

Copy \`clawql-starter-mcp.json\` to:

- Cursor project: \`.cursor/mcp.json\`
- Or user MCP config for your client

Never put API tokens in mcp.json or git. Use \`~/.ClawQL/vault/providers.json\`
(local) or Cursor Secrets / HashiCorp Vault in production.

## 3. First agent loop

1. \`memory_recall\` with a focused query
2. \`search\` → \`execute\` for API operations
3. \`memory_ingest\` after durable decisions
4. Optional: \`memory_sync\` \`{ "direction": "auto" }\` at end of cloud runs

## Docs

- Quickstart: https://docs.clawql.com/quickstart
- Agent setup: https://docs.clawql.com/agent-setup
- Migrate to 8.0: https://docs.clawql.com/getting-started/migrate-to-8.0
- Learn memory: https://docs.clawql.com/learn/memory
`

export type StarterPackFile = {
  filename: string
  mediaType: string
  content: string
}

export function buildStarterPackFiles(): StarterPackFile[] {
  return [
    {
      filename: 'clawql-starter-mcp.json',
      mediaType: 'application/json',
      content: STARTER_MCP_JSON,
    },
    {
      filename: 'CLAWQL-STARTER-README.md',
      mediaType: 'text/markdown;charset=utf-8',
      content: STARTER_README,
    },
  ]
}

export function downloadTextFile(
  filename: string,
  content: string,
  mediaType: string,
): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mediaType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function claimStarterPackDownloads(): {
  ok: true
  claimedAt: string
  files: Array<{ filename: string; bytes: number }>
  mcpJson: string
  readme: string
  nextSteps: string[]
} {
  const files = buildStarterPackFiles()
  for (const file of files) {
    downloadTextFile(file.filename, file.content, file.mediaType)
  }
  const claimedAt = new Date().toISOString()
  return {
    ok: true,
    claimedAt,
    files: files.map((f) => ({
      filename: f.filename,
      bytes: f.content.length,
    })),
    mcpJson: STARTER_MCP_JSON,
    readme: STARTER_README,
    nextSteps: [
      'Save clawql-starter-mcp.json as .cursor/mcp.json (or merge mcpServers.clawql).',
      'Run: npx -p clawql-mcp clawql init --interactive',
      'Put provider tokens in ~/.ClawQL/vault/providers.json — never in mcp.json.',
      'Try memory_recall → search → execute → memory_ingest.',
      'Read https://docs.clawql.com/agent-setup',
    ],
  }
}
