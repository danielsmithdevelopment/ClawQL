import { expect, test } from '@playwright/test'

import { enrichedChatDonePayload, enrichedChatStreamBody } from './helpers/enriched-chat-mock'
import { mockAgentConfig, mockChatVaultApi } from './helpers/mock-chat-vault'

async function openNewChat(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-agent-chat').click()
  await page.getByRole('button', { name: 'New chat' }).click()
  const input = page.getByPlaceholder(/Message Claw/i)
  await input.waitFor({ state: 'visible', timeout: 15_000 })
  return input
}

test.describe('Agent Chat UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatVaultApi(page)
  })

  test('loads chat panel and shows composer', async ({ page }) => {
    await openNewChat(page)
    await expect(page.getByText(/SSE stream|JSON mode/i)).toBeVisible()
  })

  test('demo send shows agent reply in conversation', async ({ page }) => {
    const input = await openNewChat(page)
    await input.fill('hello claw')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('claw — agent')).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('Agent Chat enriched payload (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatVaultApi(page)
  })

  test('renders tool steps, document cards, and citations from SSE stream', async ({ page }) => {
    await mockAgentConfig(page, { chatStream: true })

    await page.route('**/api/agent/chat/stream', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: enrichedChatStreamBody(),
      })
    })

    const input = await openNewChat(page)
    await input.fill('process invoice')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(enrichedChatDonePayload.reply)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Tool execution')).toBeVisible()
    await expect(page.getByText('execute paperless::documents_create')).toBeVisible()
    await expect(page.getByText('invoice.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('Paperless #42')).toBeVisible()
    await expect(page.getByText('Memory/policy.md')).toBeVisible()
    await expect(page.getByText('vacation policy excerpt')).toBeVisible()
    await expect(page.getByText('paperless', { exact: true })).toBeVisible()
  })

  test('renders enriched fields from JSON fallback when streaming disabled', async ({ page }) => {
    await mockAgentConfig(page, { chatStream: false })

    await page.route('**/api/agent/chat', async (route) => {
      const url = route.request().url()
      if (route.request().method() !== 'POST' || url.includes('/stream')) return route.continue()
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(enrichedChatDonePayload),
      })
    })

    const input = await openNewChat(page)
    await expect(page.getByText('JSON mode')).toBeVisible()
    await input.fill('process invoice')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(enrichedChatDonePayload.reply)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('execute paperless::documents_create')).toBeVisible()
    await expect(page.getByText('Paperless #42')).toBeVisible()
  })
})
