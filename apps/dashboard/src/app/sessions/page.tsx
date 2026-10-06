import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SessionsRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Sessions"
      description="Live and recent agent sessions across your org — fixture shell for now."
    />
  )
}
