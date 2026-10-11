import { AuditPage } from '@/components/managed/AuditPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

/** Console Audit UI. Served at `/audit` via middleware rewrite from document navigations. */
export default function AuditPageRoute() {
  requireManagedConsole()
  return <AuditPage />
}
