import { AuditPage } from '@/components/managed/AuditPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function AuditPageRoute() {
  requireManagedConsole()
  return <AuditPage />
}
