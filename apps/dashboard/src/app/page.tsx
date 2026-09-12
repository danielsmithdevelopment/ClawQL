import { DashboardShell } from '@/components/dashboard/DashboardShell'
import type { EnvCatalog } from '@/lib/env-catalog'
import catalog from '@/generated/env-catalog.json'

const data = catalog as EnvCatalog

export default function Page() {
  return <DashboardShell catalog={data} />
}
