import { test, expect } from '@playwright/test'

import { CLOUD_E2E_SCENARIOS } from '../../catalog/scenarios'
import { runScenario } from '../../helpers/scenario'

const nightlyIds = CLOUD_E2E_SCENARIOS.filter((s) => s.run === 'Nightly').map((s) => s.id)

for (const id of nightlyIds) {
  test(`${id} harness pass-when`, async () => {
    const result = await runScenario(id)
    expect(result.ok, result.error ?? JSON.stringify(result.details)).toBe(true)
  })
}
