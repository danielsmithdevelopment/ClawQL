import Link from 'next/link'

import { Tag } from '@/components/Tag'
import { trainingModules } from '@/generated/security-training/registry'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Agentic AI security training (20 modules)',
  description:
    'Vendor-neutral security curriculum: supply chain, admission control, zero trust, MCP runtime, data classification, IR, and quarterly review — self-study or instructor-led.',
  path: '/security/best-practices',
})

export const dynamic = 'force-static'

export default function SecurityTrainingHubPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          Training curriculum
        </Tag>
      </div>

      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
        Agentic AI security training
      </h1>
      <p className="mt-4 max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">
        Twenty modules derived from the repo&apos;s{' '}
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/docs/security/security-best-practices-series"
          className="font-medium text-claw-graph underline decoration-claw-graph/40 underline-offset-2 hover:text-zinc-900 dark:text-claw-cyan dark:hover:text-claw-cyan-bright"
          rel="noopener noreferrer"
        >
          security-best-practices-series
        </a>
        . Content is synced at site build for static HTML and search. Edit the
        Markdown in the repo, then run{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm dark:bg-white/10">
          node scripts/sync-security-training-modules.mjs
        </code>{' '}
        from <code className="font-mono text-sm">website/</code> (also runs on{' '}
        <code className="font-mono text-sm">prebuild</code>).
      </p>

      <p className="not-prose mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/security"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          ← Security overview
        </Link>
        {' · '}
        <Link
          href="/security/defense-in-depth"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-white"
        >
          Defense in depth (full guide)
        </Link>
      </p>

      <ol className="not-prose mt-10 space-y-3 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        {trainingModules.map((m) => (
          <li
            key={m.slug}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span className="w-8 shrink-0 font-mono text-sm text-zinc-500 dark:text-zinc-400">
              {m.part}.
            </span>
            <Link
              href={`/security/best-practices/${m.slug}`}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
            >
              {m.title}
            </Link>
            <span className="w-full pl-11 text-sm text-zinc-600 sm:w-auto sm:pl-0 dark:text-zinc-400">
              {m.description}
            </span>
          </li>
        ))}
      </ol>
    </article>
  )
}
