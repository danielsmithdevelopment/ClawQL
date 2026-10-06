import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function ProfileRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Your profile"
      description="Your security keys, notification preferences, and active console sessions."
    />
  )
}
