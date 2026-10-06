import { expect, type Page } from '@playwright/test'

import { waitForServer } from './harness'

/** Escape a path for use in a URL regex (including backslashes). */
export function hrefUrlPattern(href: string): RegExp {
  if (href === '/') return /\/(?:\?.*)?$/
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?:\\?.*)?$`)
}

export const SIDEBAR_ROUTES = [
  { href: '/', testId: 'managed-nav-home', crumb: 'Home' },
  { href: '/sessions', testId: 'managed-nav-sessions', crumb: 'Sessions' },
  { href: '/review', testId: 'managed-nav-review', crumb: 'Review' },
  { href: '/gateway', testId: 'managed-nav-gateway', crumb: 'Gateway' },
  { href: '/automations', testId: 'managed-nav-automations', crumb: 'Automations' },
  { href: '/skills', testId: 'managed-nav-skills', crumb: 'Skills' },
  { href: '/memory', testId: 'managed-nav-memory', crumb: 'Memory' },
  { href: '/connections', testId: 'managed-nav-connections', crumb: 'Connections' },
  { href: '/audit', testId: 'managed-nav-audit', crumb: 'Audit' },
  { href: '/team', testId: 'managed-nav-team', crumb: 'Team' },
  { href: '/usage', testId: 'managed-nav-usage', crumb: 'Usage' },
  { href: '/settings', testId: 'managed-nav-settings', crumb: 'Settings' },
] as const

export const PAGE_TABS: Record<string, readonly string[]> = {
  '/gateway': ['gateway-tab-inference', 'gateway-tab-mcp', 'gateway-tab-sites'],
  '/automations': [
    'automations-tab-subscriptions',
    'automations-tab-watched',
    'automations-tab-webhooks',
    'automations-tab-schedules',
    'automations-tab-types',
  ],
  '/skills': [
    'skills-tab-active',
    'skills-tab-proving',
    'skills-tab-proposed',
    'skills-tab-retired',
  ],
  '/memory': [
    'memory-tab-explorer',
    'memory-tab-uploads',
    'memory-tab-pipelines',
    'memory-tab-ontology',
  ],
  '/connections': [
    'connections-tab-connections',
    'connections-tab-keys',
    'connections-tab-groups',
  ],
  '/team': ['team-tab-people', 'team-tab-groups', 'team-tab-roles'],
  '/usage': ['usage-tab-usage', 'usage-tab-plan', 'usage-tab-payment'],
  '/review': ['review-section-queue', 'review-section-policies'],
  '/settings': [
    'settings-nav-general',
    'settings-nav-signin',
    'settings-nav-privacy',
    'settings-nav-network',
    'settings-nav-advanced',
  ],
}

export async function openManagedConsole(page: Page) {
  await waitForServer()
  await page.goto('/')
  await expect(page.getByTestId('managed-nav-home')).toBeVisible()
  await expect(page.getByText('Acme Robotics').first()).toBeVisible()
}

export async function expectNoPageError(page: Page) {
  await expect(page.locator('body')).not.toContainText('Application error')
  await expect(page.locator('body')).not.toContainText('Internal Server Error')
}

export async function clickAllTabs(page: Page, path: string) {
  const tabs = PAGE_TABS[path]
  if (!tabs) return
  for (const testId of tabs) {
    const tab = page.getByTestId(testId)
    if ((await tab.count()) === 0) continue
    await expect(tab).toBeVisible({ timeout: 5_000 })
    await tab.click({ force: true, timeout: 5_000 })
    await expectNoPageError(page)
  }
}
