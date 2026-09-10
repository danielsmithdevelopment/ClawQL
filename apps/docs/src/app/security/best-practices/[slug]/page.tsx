import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DocProse } from '@/components/DocProse'
import { Tag } from '@/components/Tag'
import {
  getTrainingMeta,
  trainingBodies,
  trainingModules,
} from '@/generated/security-training/registry'
import { docsPageMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return trainingModules.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const m = getTrainingMeta(slug)
  if (!m) {
    return {}
  }
  return docsPageMetadata({
    title: m.title,
    description: m.description,
    path: `/security/best-practices/${slug}`,
    ogType: 'article',
  })
}

export default async function SecurityTrainingModulePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const m = getTrainingMeta(slug)
  const Body = trainingBodies[slug]
  if (!m || !Body) {
    notFound()
  }

  const prevHref = m.prev ? `/security/best-practices/${m.prev}` : null
  const nextHref = m.next ? `/security/best-practices/${m.next}` : null

  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          {`Training · Part ${m.part}/${m.totalParts}`}
        </Tag>
      </div>

      <p className="not-prose mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/security/best-practices"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Agentic AI security curriculum
        </Link>
        {' · '}
        <Link
          href="/security"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Security overview
        </Link>
      </p>

      <DocProse className="flex-auto">
        <Body />
      </DocProse>

      <nav
        aria-label="Module navigation"
        className="not-prose mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-900/10 pt-8 text-sm dark:border-white/10"
      >
        {prevHref ? (
          <Link
            href={prevHref}
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            ← Previous module
          </Link>
        ) : (
          <span />
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            Next module →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  )
}
