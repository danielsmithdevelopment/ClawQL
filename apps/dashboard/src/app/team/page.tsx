import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function TeamRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Team"
      description="Who's in your org, what they can do, and who can approve what agents ask for."
    />
  )
}
