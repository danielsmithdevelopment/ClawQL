'use client'

import { PageChrome } from '@/components/managed/PageChrome'

export function StubPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <PageChrome crumbs={[title]} title={title} description={description}>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-800">Fixture shell — UI coming next</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Navigation and chrome match the ClawQL Cloud mockups. This view is stubbed so we can land Home, keys, and
          billing first.
        </p>
      </div>
    </PageChrome>
  )
}
