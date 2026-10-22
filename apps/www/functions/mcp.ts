/**
 * Public discovery MCP (Streamable HTTP) on Cloudflare Pages.
 *
 * Honest, read-only tools for agents hitting clawql.com/mcp — install hints,
 * docs links, and llms.txt. Full product MCP remains `npx clawql-mcp` /
 * `clawql-mcp-http` (self-host).
 *
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = { name: 'clawql-discovery', version: '8.0.0' }

const TOOLS = [
  {
    name: 'clawql_install',
    description:
      'Return official ClawQL MCP install commands (stdio CLI and Streamable HTTP self-host).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'clawql_docs_index',
    description: 'Return canonical ClawQL documentation and discovery URLs for agents.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'clawql_llms_txt',
    description: 'Fetch https://clawql.com/llms.txt (agent site index).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const

type JsonRpcId = string | number | null

function jsonRpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function callTool(name: string): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (name === 'clawql_install') {
    return {
      content: [
        {
          type: 'text',
          text: [
            '# ClawQL MCP install',
            '',
            'stdio: `npx clawql-mcp`',
            'HTTP: `npx -p clawql-mcp clawql-mcp-http` (path `/mcp`)',
            'Shell: `curl -fsSL https://clawql.com/install | bash`',
            'npm: https://www.npmjs.com/package/clawql-mcp',
            '',
            'This public endpoint (`https://clawql.com/mcp`) is a discovery MCP only.',
          ].join('\n'),
        },
      ],
    }
  }
  if (name === 'clawql_docs_index') {
    return {
      content: [
        {
          type: 'text',
          text: [
            'docs: https://docs.clawql.com',
            'getting-started: https://docs.clawql.com/getting-started',
            'mcp-tools: https://docs.clawql.com/mcp/mcp-tools',
            'openapi: https://docs.clawql.com/openapi.json',
            'server-card: https://clawql.com/.well-known/mcp/server-card.json',
            'server.json: https://clawql.com/.well-known/mcp/server.json',
            'ard: https://clawql.com/.well-known/ard.json',
            'auth.md: https://clawql.com/auth.md',
            'pricing.md: https://clawql.com/pricing.md',
            'contact: https://clawql.com/contact/',
          ].join('\n'),
        },
      ],
    }
  }
  if (name === 'clawql_llms_txt') {
    const res = await fetch('https://clawql.com/llms.txt')
    const text = res.ok ? await res.text() : `Failed to fetch llms.txt (${res.status})`
    return { content: [{ type: 'text', text }] }
  }
  throw new Error(`Unknown tool: ${name}`)
}

async function handleRpc(msg: {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}) {
  const id = (msg.id ?? null) as JsonRpcId
  const method = msg.method ?? ''

  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    })
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }
  if (method === 'ping') {
    return jsonRpcResult(id, {})
  }
  if (method === 'tools/list') {
    return jsonRpcResult(id, { tools: TOOLS })
  }
  if (method === 'tools/call') {
    const name = String((msg.params as { name?: string } | undefined)?.name ?? '')
    try {
      const result = await callTool(name)
      return jsonRpcResult(id, result)
    } catch (err) {
      return jsonRpcError(id, -32000, err instanceof Error ? err.message : String(err))
    }
  }
  return jsonRpcError(id, -32601, `Method not found: ${method}`)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, mcp-session-id',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}

export async function onRequest(context: { request: Request }) {
  const { request } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (request.method === 'GET') {
    return new Response(
      JSON.stringify({
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        transport: 'streamable-http',
        protocolVersion: PROTOCOL_VERSION,
        documentation: 'https://docs.clawql.com/mcp/mcp-tools',
        note: 'POST JSON-RPC (initialize, tools/list, tools/call). Discovery-only public MCP.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
      },
    )
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const messages = Array.isArray(body) ? body : [body]
  const responses: unknown[] = []
  for (const msg of messages) {
    const out = await handleRpc(msg as Parameters<typeof handleRpc>[0])
    if (out !== null) responses.push(out)
  }

  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS })
  }

  const payload = Array.isArray(body) ? responses : responses[0]
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'mcp-session-id': crypto.randomUUID(),
      ...CORS,
    },
  })
}
