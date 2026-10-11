import { Suspense } from 'react'

import { SettingsPage } from '@/components/managed/SettingsPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function SettingsPageRoute() {
  requireManagedConsole()
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading settings…</div>}>
      <SettingsPage />
    </Suspense>
  )
}
