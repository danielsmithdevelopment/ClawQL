import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function GatewayRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Gateway"
      description="One endpoint for your agents: models, tools and decisions, with the same identity, policy and audit everywhere."
    />
  )
}
