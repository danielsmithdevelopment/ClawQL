import { UsageBillingPage } from '@/components/managed/UsageBillingPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function UsageRoute() {
  requireManagedConsole()
  return <UsageBillingPage />
}
