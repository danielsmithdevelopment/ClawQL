import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { HomePage } from '@/components/managed/HomePage'
import { isManagedConsole } from '@/lib/console-surface'
import type { EnvCatalog } from '@/lib/env-catalog'
import catalog from '@/generated/env-catalog.json'

const data = catalog as EnvCatalog

export default function Page() {
  if (isManagedConsole()) {
    return <HomePage />
  }
  return <DashboardShell catalog={data} />
}
