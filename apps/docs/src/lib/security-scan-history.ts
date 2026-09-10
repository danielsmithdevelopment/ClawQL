import type { SecurityStatusHistory } from '@/lib/security-scan-history.types'

import history from '../../public/security-scan-history.json'

export function getSecurityStatusHistory(): SecurityStatusHistory {
  return history as SecurityStatusHistory
}

export function formatScannerCell(
  scanner: 'trivy' | 'osv',
  row: SecurityStatusHistory['runs'][number],
): string {
  const s = row.scanners[scanner]
  if (s.result === 'pass') return 'pass'
  const findings = scanner === 'trivy' ? s.findings : s.findings
  const first = findings?.[0]
  if (!first) return 'FAIL'
  const id =
    scanner === 'trivy'
      ? (first as { cveId: string }).cveId
      : (first as { osvId: string }).osvId
  return `FAIL (${id})`
}
