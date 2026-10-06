import { test } from '@playwright/test'

/**
 * Phone NFC / iPhone YubiKey — no browser can automate these.
 * Catalog Manual IDs are annotated skips only. Never assert stub
 * POST /api/e2e/scenario ok() — that previously lied that they passed.
 */
for (const id of ['REV-13', 'UX-09'] as const) {
  test(`${id} manual phone NFC — requires physical device`, async () => {
    test.info().annotations.push({
      type: 'manual',
      description:
        'Requires physical YubiKey NFC on a phone; not browser-automatable. Catalog Pass-when cannot be witnessed in this harness.',
    })
    test.skip(true, `${id}: physical phone NFC / YubiKey — impossible in browser harness`)
  })
}
