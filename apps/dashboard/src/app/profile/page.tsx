import { ProfilePage } from '@/components/managed/ProfilePage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function ProfilePageRoute() {
  requireManagedConsole()
  return <ProfilePage />
}
