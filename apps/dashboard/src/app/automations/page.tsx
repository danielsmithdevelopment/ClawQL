import { AutomationsPage } from '@/components/managed/AutomationsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function AutomationsPageRoute() {
  requireManagedConsole()
  return <AutomationsPage />
}
