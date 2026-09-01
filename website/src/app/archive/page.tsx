import { DocsArchiveBrowser } from '@/components/DocsArchiveBrowser'
import archive from '@/generated/docs-archive.json'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Docs archive',
  description:
    'Searchable index of ClawQL docs pages kept off the first-run sidebar — case studies, specs, infra guides, and legacy redirects.',
  path: '/archive',
})

export const dynamic = 'force-static'

export default function DocsArchivePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-16">
      <header className="not-prose mb-8 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
          Docs archive
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          The sidebar stays focused on the main paths. Everything else lives
          here — filter by name or path to find case studies, deep specs, and
          infra one-offs.
        </p>
      </header>

      <DocsArchiveBrowser
        groups={archive.groups}
        entryCount={archive.entryCount}
      />
    </article>
  )
}
