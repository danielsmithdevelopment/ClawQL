import { GatewayPage } from '@/components/managed/GatewayPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function GatewayPageRoute() {
  requireManagedConsole()
  return <GatewayPage />
}
