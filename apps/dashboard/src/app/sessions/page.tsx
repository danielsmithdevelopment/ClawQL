import { SessionsPage } from '@/components/managed/SessionsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SessionsPageRoute() {
  requireManagedConsole()
  return <SessionsPage />
}
