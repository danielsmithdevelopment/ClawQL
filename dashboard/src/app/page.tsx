import type { EnvCatalog } from '@/lib/env-catalog'
import catalog from '@/generated/env-catalog.json'
import { EnvForm } from '@/components/EnvForm'
import { Logo } from '@/components/Logo'

const data = catalog as EnvCatalog

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Map variables from <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-white/10">.env.example</code>{' '}
            into the cluster Secret used by{' '}
            <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-white/10">clawql-mcp-http</code>, then
            restart the rollout.
          </p>
        </div>
      </header>
      <div id="main-content">
        <EnvForm catalog={data} />
      </div>
    </div>
  )
}
