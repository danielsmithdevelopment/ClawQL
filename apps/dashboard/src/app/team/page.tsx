import { TeamPage } from '@/components/managed/TeamPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function TeamPageRoute() {
  requireManagedConsole()
  return <TeamPage />
}
