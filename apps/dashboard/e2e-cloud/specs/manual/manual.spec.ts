import { test, expect } from '@playwright/test'

import { runScenario } from '../../helpers/scenario'

/**
 * Phone NFC / iPhone YubiKey — no browser can automate these.
 * Harness returns skipped+manual; suite records them as intentional skips.
 */
for (const id of ['REV-13', 'UX-09'] as const) {
  test(`${id} manual phone NFC — skipped in browser harness`, async () => {
    const result = await runScenario(id)
    expect(result.ok).toBe(true)
    expect(result.manual).toBe(true)
    expect(result.skipped).toBe(true)
    test.info().annotations.push({
      type: 'manual',
      description: 'Requires physical YubiKey NFC on a phone; not browser-automatable',
    })
  })
}
