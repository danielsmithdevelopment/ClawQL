import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function AuditRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Audit"
      description="Every action through ClawQL, written once and chained, so anyone can check that nothing was changed or removed."
    />
  )
}
