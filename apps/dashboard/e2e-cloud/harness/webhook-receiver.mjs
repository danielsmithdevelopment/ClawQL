/**
 * Controllable webhook receiver for EV-* scenarios.
 * Records headers/bodies; can return 200 / 503 / 410 on demand.
 */
import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'

const port = Number(process.env.CLAWQL_E2E_WEBHOOK_PORT ?? '4091')
const state = {
  mode: '200', // 200 | 503 | 410
  deliveries: [],
  secret: process.env.CLAWQL_E2E_WEBHOOK_SECRET ?? 'whsec_test_acme',
  challengeOk: true,
}

function verifyStandardWebhooks(req, rawBody, secret) {
  const id = req.headers['webhook-id']
  const ts = req.headers['webhook-timestamp']
  const sig = req.headers['webhook-signature']
  if (!id || !ts || !sig) return false
  const signed = `${id}.${ts}.${rawBody}`
  const expected = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64').length
    ? Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    : Buffer.from(secret)).update(signed).digest('base64')
  const parts = String(sig).split(' ')
  for (const part of parts) {
    const [, value] = part.split(',')
    if (!value) continue
    try {
      const a = Buffer.from(value)
      const b = Buffer.from(expected)
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    } catch {
      /* continue */
    }
  }
  // Also accept simple HMAC hex for harness-local deliveries
  const hex = createHmac('sha256', secret).update(signed).digest('hex')
  return String(sig).includes(hex)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, mode: state.mode, count: state.deliveries.length }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/control') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (body.mode) state.mode = body.mode
    if (body.secret) state.secret = body.secret
    if (typeof body.challengeOk === 'boolean') state.challengeOk = body.challengeOk
    if (body.reset) state.deliveries = []
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, mode: state.mode, count: state.deliveries.length }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/deliveries') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ deliveries: state.deliveries }))
    return
  }

  if (req.method === 'POST' && (url.pathname === '/hook' || url.pathname === '/')) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v ?? '')]),
    )
    let json = null
    try {
      json = JSON.parse(rawBody)
    } catch {
      json = null
    }
    if (json?.type === 'webhook.challenge' || url.searchParams.get('challenge')) {
      if (!state.challengeOk) {
        res.writeHead(400)
        res.end('challenge rejected')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, challenge: json?.challenge ?? 'ok' }))
      return
    }
    const verified = verifyStandardWebhooks(req, rawBody, state.secret)
    state.deliveries.push({
      at: new Date().toISOString(),
      headers,
      rawBody,
      json,
      verified,
      eventId: headers['webhook-id'] ?? json?.id ?? null,
    })
    const code = state.mode === '503' ? 503 : state.mode === '410' ? 410 : 200
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: code === 200, status: code }))
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[e2e-webhook] listening on http://127.0.0.1:${port}`)
})
