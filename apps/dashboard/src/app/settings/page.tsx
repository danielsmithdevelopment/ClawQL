import { SettingsPage } from '@/components/managed/SettingsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SettingsPageRoute() {
  requireManagedConsole()
  return <SettingsPage />
}
