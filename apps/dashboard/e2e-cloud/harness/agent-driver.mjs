/**
 * Scripted MCP + OpenAI-compatible client for GW-* / REV-* / SK-* scenarios.
 * Talks to production-shaped gateway URLs (/v1, /mcp) with a chosen key.
 */
import { createHash } from 'node:crypto'

const gateway = process.env.CLAWQL_E2E_GATEWAY_BASE ?? 'https://acme.cloud.clawql.com'
const localGateway = process.env.CLAWQL_E2E_GATEWAY_LOCAL ?? 'http://127.0.0.1:3040'

export function digestArgs(args) {
  return createHash('sha256').update(JSON.stringify(args ?? {})).digest('hex')
}

/** Retry transient Next HMR / ECONNRESET mid-suite (same policy as helpers/harness). */
async function fetchRetry(url, init, attempts = 10) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function openaiChat({
  key,
  model = 'standard',
  messages,
  baseUrl = `${localGateway}/v1`,
}) {
  const res = await fetchRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export async function mcpListTools({
  key,
  baseUrl = `${localGateway}/mcp`,
  client,
}) {
  const res = await fetchRetry(`${baseUrl}/tools/list`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(client ? { 'x-clawql-client': client } : {}),
    },
    body: JSON.stringify({}),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export async function mcpCallTool({
  key,
  name,
  args,
  baseUrl = `${localGateway}/mcp`,
}) {
  const res = await fetchRetry(`${baseUrl}/tools/call`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name, arguments: args }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, digest: digestArgs(args) }
}

export async function decisionCall({
  key,
  site,
  text,
  baseUrl = `${localGateway}/decision`,
}) {
  const res = await fetchRetry(baseUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ site, text }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export const KEYS = {
  legalOps: process.env.CLAWQL_E2E_KEY_LEGAL_OPS ?? 'cqk_fixture_legal_ops',
  supportBot: process.env.CLAWQL_E2E_KEY_SUPPORT ?? 'cqk_fixture_support_bot',
  releaseAgent: process.env.CLAWQL_E2E_KEY_RELEASE ?? 'cqk_fixture_release_agent',
  docsPipeline: process.env.CLAWQL_E2E_KEY_DOCS ?? 'cqk_fixture_docs_pipeline',
  engineering: process.env.CLAWQL_E2E_KEY_ENGINEERING ?? 'cqk_fixture_ci_pipeline',
  supportGroup: process.env.CLAWQL_E2E_KEY_SUPPORT_GROUP ?? 'cqk_fixture_support_bot',
}

export { gateway, localGateway }
