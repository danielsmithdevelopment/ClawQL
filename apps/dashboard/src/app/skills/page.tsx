import { SkillsPage } from '@/components/managed/SkillsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SkillsPageRoute() {
  requireManagedConsole()
  return <SkillsPage />
}
