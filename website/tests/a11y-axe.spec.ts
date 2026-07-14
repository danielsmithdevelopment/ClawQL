import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** Core routes for static HTML + common chrome (nav, search trigger, MDX). */
const routes = [
  '/',
  '/quickstart',
  '/install',
  '/getting-started/for-teams',
  '/reference/protocol',
  '/deployment/kubernetes',
  '/inference/clawql-inference',
  '/plugins',
  '/learn',
  '/security/best-practices',
  '/security/best-practices/input-validation-protocol-hardening',
] as const

for (const path of routes) {
  test(`axe: no critical or serious violations on ${path}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light')
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    })
    await page.goto(path, { waitUntil: 'load' })
    const results = await new AxeBuilder({ page }).analyze()
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(
      blocking,
      blocking
        .map(
          (v) =>
            `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.html).join('; ')}`,
        )
        .join('\n'),
    ).toEqual([])
  })
}
