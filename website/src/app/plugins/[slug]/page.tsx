import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DocProse } from '@/components/DocProse'
import { Tag } from '@/components/Tag'
import {
  getPluginMeta,
  pluginBodies,
  pluginPages,
} from '@/generated/clawql-plugins/registry'
import { docsPageMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

const STATUS_TAG: Record<
  string,
  { label: string; color: 'claw' | 'sky' | 'amber' | 'zinc' | 'rose' }
> = {
  'always-on': { label: 'Always on', color: 'sky' },
  'default-on': { label: 'Default on', color: 'claw' },
  'opt-in': { label: 'Opt in', color: 'amber' },
  planned: { label: 'Planned', color: 'zinc' },
  roadmap: { label: 'Roadmap', color: 'zinc' },
  shipped: { label: 'Available', color: 'sky' },
}

export function generateStaticParams() {
  return pluginPages.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const m = getPluginMeta(slug)
  if (!m) {
    return {}
  }
  return docsPageMetadata({
    title: m.title,
    description: m.description,
    path: `/plugins/${slug}`,
    ogType: 'article',
  })
}

export default async function PluginPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const m = getPluginMeta(slug)
  const Body = pluginBodies[slug]
  if (!m || !Body) {
    notFound()
  }

  const status = STATUS_TAG[m.status] ?? {
    label: m.status,
    color: 'zinc' as const,
  }
  const prevHref = m.prev ? `/plugins/${m.prev}` : null
  const nextHref = m.next ? `/plugins/${m.next}` : null

  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Plugin
        </Tag>
        <Tag color={status.color} variant="medium">
          {status.label}
        </Tag>
        {m.package ? (
          <Tag color="zinc" variant="medium">
            {m.package}
          </Tag>
        ) : null}
      </div>

      <p className="not-prose mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/plugins"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Plugins
        </Link>
        {' · '}
        <Link
          href="/plugins#registry"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Registry
        </Link>
        {' · '}
        <Link
          href="/plugins#plugin-model"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Plugin model
        </Link>
      </p>

      <DocProse className="flex-auto">
        <Body />
      </DocProse>

      <nav
        aria-label="Plugin navigation"
        className="not-prose mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-900/10 pt-8 text-sm dark:border-white/10"
      >
        {prevHref ? (
          <Link
            href={prevHref}
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            ← Previous plugin
          </Link>
        ) : (
          <span />
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            Next plugin →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  )
}
