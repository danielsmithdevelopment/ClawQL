import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function AutomationsRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Automations"
      description="Scheduled checks, streams, and event deliveries your agents run on your behalf."
    />
  )
}
