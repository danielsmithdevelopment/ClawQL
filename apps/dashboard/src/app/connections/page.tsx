import { ConnectionsPage } from '@/components/managed/ConnectionsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function ConnectionsRoute() {
  requireManagedConsole()
  return <ConnectionsPage />
}
