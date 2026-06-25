#!/usr/bin/env node
/**
 * Local HTTP shim so the dashboard Agent Chat panel can reach OpenClaw.
 *
 * Chart copy: charts/clawql-mcp/files/openclaw-chat-bridge.mjs (keep in sync with this file).
 *
 * The dashboard API route POSTs JSON { message, threadTitle?, threadId? } and expects JSON { reply }.
 * OpenClaw exposes `openclaw agent` (CLI) — not this HTTP shape — so this script runs the CLI per request.
 *
 * Usage:
 *   cd dashboard && node scripts/openclaw-chat-bridge.mjs
 *   CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL=http://127.0.0.1:8787/v1/chat npm run dev
 *
 * Prereqs: `openclaw` on PATH, model auth (OpenAI, OpenRouter, etc.). Repo-root `.env` is merged in (unset keys only) so `OPENROUTER_API_KEY` there is visible to `openclaw agent` child processes — or use `openclaw models auth paste-token --provider openrouter`.
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

/** Load repo-root `.env` into process.env without overriding existing vars (minimal parser). */
function loadRepoRootEnvDotfile() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const envPath = path.join(repoRoot, '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const noExport = t.replace(/^export\s+/i, '')
    const eq = noExport.indexOf('=')
    if (eq <= 0) continue
    const key = noExport.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    let val = noExport.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

loadRepoRootEnvDotfile()

const HOST = process.env.OPENCLAW_CHAT_BRIDGE_HOST ?? '127.0.0.1'
const PORT = Number(process.env.OPENCLAW_CHAT_BRIDGE_PORT ?? process.env.PORT ?? 8787)
const AGENT_ID = process.env.CLAWQL_OPENCLAW_AGENT_ID ?? process.env.OPENCLAW_AGENT_ID ?? 'main'
const OPENCLAW_BIN = process.env.CLAWQL_OPENCLAW_BIN ?? process.env.OPENCLAW_BIN ?? 'openclaw'
/** When set (e.g. `/app/dist/index.js` in the OpenClaw container), prepended before `agent` subcommand args. */
const OPENCLAW_CLI_ENTRY = process.env.OPENCLAW_CLI_ENTRY ?? ''
const TIMEOUT_SEC = Number(process.env.OPENCLAW_AGENT_TIMEOUT_SEC ?? 120)

function json(res, status, body) {
  const s = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(s),
  })
  res.end(s)
}

/** Best-effort extract human reply from `openclaw agent --json` stdout. */
function replyFromAgentJson(parsed) {
  if (parsed == null) return null
  if (typeof parsed === 'string') return parsed
  if (typeof parsed.reply === 'string') return parsed.reply
  if (typeof parsed.response === 'string') return parsed.response
  if (typeof parsed.output === 'string') return parsed.output
  if (typeof parsed.text === 'string') return parsed.text
  if (typeof parsed.message === 'string') return parsed.message
  if (Array.isArray(parsed.payloads) && parsed.payloads.length > 0) {
    const parts = parsed.payloads
      .map((p) => (p && typeof p === 'object' && typeof p.text === 'string' ? p.text.trim() : ''))
      .filter(Boolean)
    if (parts.length > 0) return parts.join('\n\n')
  }
  if (parsed.meta && typeof parsed.meta === 'object') {
    const visible = parsed.meta.finalAssistantVisibleText ?? parsed.meta.finalAssistantRawText
    if (typeof visible === 'string' && visible.trim()) return visible.trim()
  }
  if (Array.isArray(parsed.messages)) {
    for (let i = parsed.messages.length - 1; i >= 0; i--) {
      const m = parsed.messages[i]
      if (m && typeof m === 'object') {
        const c = m.content ?? m.text ?? m.body
        if (typeof c === 'string') return c
      }
    }
  }
  if (typeof parsed.result === 'object' && parsed.result && typeof parsed.result.text === 'string') {
    return parsed.result.text
  }
  try {
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(parsed)
  }
}

function openclawAgentArgs(sessionId, message) {
  const agentArgs = [
    'agent',
    '--local',
    '--agent',
    AGENT_ID,
    '--session-id',
    sessionId,
    '-m',
    message,
    '--json',
    '--timeout',
    String(Number.isFinite(TIMEOUT_SEC) ? TIMEOUT_SEC : 120),
  ]
  return OPENCLAW_CLI_ENTRY ? [OPENCLAW_CLI_ENTRY, ...agentArgs] : agentArgs
}

function runOpenclawAgent(sessionId, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(OPENCLAW_BIN, openclawAgentArgs(sessionId, message), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      err += d
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 0, out: out.trim(), err: err.trim() })
    })
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/')) {
    return json(res, 200, { ok: true, service: 'openclaw-chat-bridge', agent: AGENT_ID, port: PORT })
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat') {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    return res.end('Not found')
  }

  let raw = ''
  try {
    raw = await new Promise((resolve, reject) => {
      let b = ''
      req.on('data', (c) => {
        b += c
        if (b.length > 2_000_000) reject(new Error('body too large'))
      })
      req.on('end', () => resolve(b))
      req.on('error', reject)
    })
  } catch (e) {
    return json(res, 400, { error: e instanceof Error ? e.message : 'read body failed' })
  }

  let body
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return json(res, 400, { error: 'Invalid JSON' })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return json(res, 400, { error: 'message is required' })
  }

  const threadId = typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : 'clawql-dashboard'
  const threadTitle = typeof body.threadTitle === 'string' && body.threadTitle.trim() ? body.threadTitle.trim() : ''
  const prompt = threadTitle ? `[Thread: ${threadTitle}]\n\n${message}` : message

  let result
  try {
    result = await runOpenclawAgent(threadId, prompt)
  } catch (e) {
    return json(res, 502, {
      error: e instanceof Error ? e.message : `failed to spawn ${OPENCLAW_BIN}`,
    })
  }

  if (result.code !== 0) {
    const tail = (result.err || result.out || 'openclaw agent failed').slice(-4000)
    return json(res, 502, { error: tail })
  }

  let parsed
  try {
    parsed = JSON.parse(result.out)
  } catch {
    return json(res, 200, { reply: result.out || '(empty)' })
  }

  const reply = replyFromAgentJson(parsed)
  return json(res, 200, { reply: reply ?? '(empty response)' })
})

server.listen(PORT, HOST, () => {
  console.log(
    `openclaw-chat-bridge listening on http://${HOST}:${PORT}/v1/chat (agent=${AGENT_ID}, bin=${OPENCLAW_BIN}${OPENCLAW_CLI_ENTRY ? ` entry=${OPENCLAW_CLI_ENTRY}` : ''})`,
  )
  console.log(`Set: CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL=http://127.0.0.1:${PORT}/v1/chat`)
})
