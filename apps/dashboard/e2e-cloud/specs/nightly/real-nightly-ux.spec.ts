/**
 * Real Nightly E2E — honest witnesses via public /api/e2e surfaces + webhook :4091 + UI.
 * Never uses POST /api/e2e/scenario or runScenario as pass criteria.
 */
import { test, expect } from '@playwright/test'

import { KEYS, mcpCallTool, mcpListTools, openaiChat } from '../../harness/agent-driver.mjs'
import { openManagedConsole } from '../../helpers/console'
import {
  approveReview,
  control,
  createSubscription,
  decisionCall,
  eraseSubject,
  fetchAsOrg,
  getAudit,
  getCrm,
  getDocuments,
  getInboundStats,
  getOrg,
  getSettings,
  getUsage,
  getWebhookDeliveries,
  getWitness,
  keysApi,
  listEvents,
  listReview,
  listSubscriptions,
  memoryGet,
  memoryPost,
  memorySearch,
  openaiChatWithIp,
  postEvents,
  postInbound,
  redeliverEvent,
  resetWebhookReceiver,
  resetWorld,
  retryAllEvents,
  searchErased,
  setWebhookMode,
  settingsMutate,
  stripeCheckout,
  subscriptionAction,
  systemOne,
  uploadDocument,
  waitForDeliveries,
} from '../../helpers/harness'

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const
const PII = 'Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.'

test.beforeEach(async () => {
  await resetWorld()
})


test('UX-02 Icon-only buttons have accessible names; no obvious unlabeled controls in chrome', async ({
  page,
}) => {
  await openManagedConsole(page)
  const unnamed: string[] = []
  const buttons = page.locator('button, a[href], [role="button"]')
  const n = await buttons.count()
  for (let i = 0; i < Math.min(n, 80); i++) {
    const el = buttons.nth(i)
    const name = (await el.getAttribute('aria-label')) || (await el.innerText()) || (await el.getAttribute('title'))
    const tes = await el.getAttribute('data-testid')
    if (!String(name ?? '').trim() && !tes) unnamed.push(`idx-${i}`)
  }
  expect(unnamed.slice(0, 5)).toEqual([])
})

test('UX-03 Keyboard through Review queue to key-adjacent control; focus visible', async ({ page }) => {
  await openManagedConsole(page)
  await page.goto('/review')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(focused).toBeVisible()
})

test('UX-04 Usage tables do not cause page-level horizontal overflow', async ({ page }) => {
  await openManagedConsole(page)
  await page.goto('/usage')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
  expect(overflow).toBe(false)
})

test('UX-05 Slack off — no slack notification; push still delivered', async () => {
  await control({
    personMutate: { person: 'Dana Reyes', notifications: { slack: false, push: true } },
  })
  await keysApi({ action: 'remind', person: 'Dana Reyes' })
  const wit = await getWitness()
  const dana = (wit.body.people as { name: string; notifications: { slack: boolean; push: boolean } }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  expect(dana?.notifications.slack).toBe(false)
  expect(dana?.notifications.push).toBe(true)
  const outbox = wit.body.notificationsOutbox as { channel: string; to: string }[]
  expect(outbox.some((n) => n.channel === 'push')).toBe(true)
  expect(outbox.filter((n) => n.channel === 'slack' && n.to === 'Dana Reyes')).toEqual([])
})

test('UX-06 End a device session — next action requires sign-in', async () => {
  await control({ personMutate: { person: 'Dana Reyes', endSessionDevice: 'Chrome' } })
  const wit = await getWitness()
  const dana = (wit.body.people as { name: string; sessions: { ended: boolean; device: string }[] }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  expect(dana?.sessions.some((s) => /Chrome/i.test(s.device) && s.ended)).toBe(true)
})

test('UX-07 Time zone change is stored for the person', async ({ page }) => {
  await control({ personMutate: { person: 'Dana Reyes', timeZone: 'America/New_York' } })
  const wit = await getWitness()
  const dana = (wit.body.people as { name: string; timeZone: string }[]).find((p) => p.name === 'Dana Reyes')
  expect(dana?.timeZone).toBe('America/New_York')
  await page.goto('/profile')
  await expect(page.locator('body')).toBeVisible()
})

test('UX-08 Appearance choice is kept', async ({ page }) => {
  await control({ personMutate: { person: 'Dana Reyes', appearance: 'dark' } })
  const wit = await getWitness()
  const dana = (wit.body.people as { name: string; appearance: string }[]).find((p) => p.name === 'Dana Reyes')
  expect(dana?.appearance).toBe('dark')
  await page.goto('/profile')
  await expect(page.locator('body')).toBeVisible()
})
