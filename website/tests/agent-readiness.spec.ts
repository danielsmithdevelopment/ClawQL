import { expect, test } from '@playwright/test'

const AP2_URI = 'https://github.com/google-agentic-commerce/ap2/tree/v0.1'

test.describe('agent readiness discovery', () => {
  test('auth.md is published', async ({ request }) => {
    const res = await request.get('/auth.md', {
      headers: { Accept: 'text/markdown, text/plain, */*' },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/text\/markdown/)
    const body = await res.text()
    expect(body).toContain('# auth.md')
    expect(body).toContain('/.well-known/oauth-protected-resource')
  })

  test('oauth-authorization-server includes agent_auth', async ({ request }) => {
    const res = await request.get('/.well-known/oauth-authorization-server')
    expect(res.status()).toBe(200)
    const doc = await res.json()
    expect(doc.agent_auth).toBeTruthy()
    expect(doc.agent_auth.skill).toMatch(/\/auth\.md$/)
    expect(doc.agent_auth.identity_endpoint).toContain('/agent/identity')
    expect(doc.grant_types_supported).toContain(
      'urn:workos:agent-auth:grant-type:claim',
    )
  })

  test('agent-card.json is valid A2A discovery', async ({ request }) => {
    const res = await request.get('/.well-known/agent-card.json')
    expect(res.status()).toBe(200)
    const card = await res.json()
    expect(card.name).toBeTruthy()
    expect(card.skills?.length).toBeGreaterThan(0)
    const interfaces = card.supported_interfaces ?? card.supportedInterfaces
    expect(interfaces?.length).toBeGreaterThan(0)
    for (const iface of interfaces) {
      expect(iface.url).toMatch(/^https?:\/\//)
      expect(iface.protocol_binding).toBeTruthy()
    }
    const extensions = card.capabilities?.extensions ?? []
    const ap2 = extensions.find(
      (e: { uri?: string }) => e.uri === AP2_URI,
    )
    expect(ap2?.params?.roles).toContain('merchant')
  })

  test('commerce openapi exposes x-payment-info', async ({ request }) => {
    const res = await request.get('/openapi.json')
    expect(res.status()).toBe(200)
    const doc = await res.json()
    const probe = doc.paths?.['/api/v1']?.get
    expect(probe?.['x-payment-info']).toBeTruthy()
    expect(probe['x-payment-info'].protocols?.[0]?.x402).toBeTruthy()
  })

  test('x402 probe returns 402 with PAYMENT-REQUIRED', async ({ request }) => {
    const res = await request.get('/api/v1')
    expect(res.status()).toBe(402)
    const paymentRequired = res.headers()['payment-required']
    expect(paymentRequired).toBeTruthy()
    const decoded = JSON.parse(
      Buffer.from(paymentRequired!, 'base64').toString('utf8'),
    )
    expect(decoded.x402Version).toBe(2)
    expect(decoded.accepts?.length).toBeGreaterThan(0)
  })

  test('UCP and ACP discovery documents exist', async ({ request }) => {
    const ucp = await request.get('/.well-known/ucp')
    expect(ucp.status()).toBe(200)
    const ucpDoc = await ucp.json()
    expect(ucpDoc.ucp?.services?.['dev.ucp.shopping']).toBeTruthy()

    const acp = await request.get('/.well-known/acp.json')
    expect(acp.status()).toBe(200)
    const acpDoc = await acp.json()
    expect(acpDoc.protocol?.name).toBe('acp')
    expect(acpDoc.capabilities?.services).toContain('checkout')
  })

  test('payments.json enables x402 discovery', async ({ request }) => {
    const res = await request.get('/.well-known/payments.json')
    expect(res.status()).toBe(200)
    const doc = await res.json()
    const x402 = doc.payment_methods?.find(
      (m: { type?: string }) => m.type === 'x402',
    )
    expect(x402?.enabled).toBe(true)
    expect(x402?.resources?.length).toBeGreaterThan(0)
  })
})
