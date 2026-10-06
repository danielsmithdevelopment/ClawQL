import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SettingsRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Settings"
      description="Org-wide rules. Every change here is recorded in the audit log."
    />
  )
}
