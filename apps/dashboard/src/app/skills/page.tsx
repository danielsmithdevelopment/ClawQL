import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SkillsRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Skills"
      description="Reusable procedures your agents have learned or your team has written."
    />
  )
}
