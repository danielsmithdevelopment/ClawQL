import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function ReviewRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Review"
      description="Everything waiting on a person: changes, sources, decisions, and skills ready to promote."
    />
  )
}
