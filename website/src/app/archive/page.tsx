import { DocsArchiveBrowser } from '@/components/DocsArchiveBrowser'
import archive from '@/generated/docs-archive.json'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Legacy URL redirects',
  description:
    'Old bookmark paths that redirect into Learn modules — schedule, notify, and session cache.',
  path: '/archive',
})

export const dynamic = 'force-static'

export default function DocsArchivePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-16">
      <header className="not-prose mb-8 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
          Legacy URL redirects
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Most docs pages are in the sidebar or hub grids. This index lists
          older bookmark paths that redirect — filter below if you need the
          canonical destination.
        </p>
      </header>

      <DocsArchiveBrowser
        groups={archive.groups}
        entryCount={archive.entryCount}
      />
    </article>
  )
}
