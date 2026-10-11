import { describe, expect, it } from 'vitest'

import { assertCatalogSpecCoverage, catalogSpecCoverageReport } from './coverage'
import {
  assertCatalogComplete,
  CLOUD_E2E_SCENARIOS,
  manualScenarios,
  nightlyScenarios,
  smokeScenarios,
} from './scenarios'

describe('CLOUD_E2E_SCENARIOS catalog', () => {
  it('is complete (199 IDs)', () => {
    expect(() => assertCatalogComplete()).not.toThrow()
    expect(CLOUD_E2E_SCENARIOS).toHaveLength(199)
  })

  it('has exactly 37 Smoke, 160 Nightly, 2 Manual', () => {
    expect(smokeScenarios()).toHaveLength(37)
    expect(nightlyScenarios()).toHaveLength(160)
    expect(manualScenarios()).toHaveLength(2)
  })

  it('maps 1:1 onto Playwright specs (no missing, no double-count, correct tier)', () => {
    const report = catalogSpecCoverageReport()
    expect(report, JSON.stringify(report, null, 2)).toMatchObject({ ok: true })
    expect(() => assertCatalogSpecCoverage()).not.toThrow()
  })
})
