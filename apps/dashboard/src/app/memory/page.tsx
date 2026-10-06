import { MemoryPage } from '@/components/managed/MemoryPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function MemoryPageRoute() {
  requireManagedConsole()
  return <MemoryPage />
}
