import { expect, test } from '@playwright/test'

const AGENT_ROUTES = [
  '/',
  '/quickstart',
  '/inference/clawql-inference',
  '/plugins/core',
  '/security/best-practices/input-validation-protocol-hardening',
] as const

for (const path of AGENT_ROUTES) {
  test(`agent markdown: ${path} returns text/markdown`, async ({ request }) => {
    const res = await request.get(path, {
      headers: { Accept: 'text/markdown' },
    })
    expect(res.status(), await res.text()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/text\/markdown/)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(100)
    expect(body).toMatch(/^---\s*\ntitle:/m)
  })
}

test('llms.txt is published', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('# ClawQL documentation')
  expect(body).toContain('/agent-setup')
})

test('AGENTS.md is published', async ({ request }) => {
  const res = await request.get('/AGENTS.md')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('MCP client')
})
