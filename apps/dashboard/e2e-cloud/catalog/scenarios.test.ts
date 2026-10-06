import { describe, expect, it } from 'vitest'

import {
  assertCatalogComplete,
  CLOUD_E2E_SCENARIOS,
  smokeScenarios,
} from './scenarios'

describe('CLOUD_E2E_SCENARIOS catalog', () => {
  it('is complete (197 IDs)', () => {
    expect(() => assertCatalogComplete()).not.toThrow()
    expect(CLOUD_E2E_SCENARIOS).toHaveLength(197)
  })

  it('has exactly 37 Smoke scenarios', () => {
    expect(smokeScenarios()).toHaveLength(37)
  })
})
