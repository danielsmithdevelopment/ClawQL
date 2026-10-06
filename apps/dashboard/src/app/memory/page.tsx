import { StubPage } from '@/components/managed/StubPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function MemoryRoute() {
  requireManagedConsole()
  return (
    <StubPage
      title="Memory & documents"
      description="What your agents remember and the documents they've read, with where every fact came from."
    />
  )
}
