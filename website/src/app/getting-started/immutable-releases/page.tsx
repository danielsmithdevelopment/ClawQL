import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Button } from '@/components/Button'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Immutable releases',
  description:
    'A calm getting-started path for clawql-release: one dry-run command, then publish and verify trusted releases — no wallets required to start.',
  path: '/getting-started/immutable-releases',
  ogType: 'article',
})

export const dynamic = 'force-static'

const steps = [
  {
    n: '1',
    title: 'Try the dry-run',
    body: 'One script proves the pipeline on your laptop.',
  },
  {
    n: '2',
    title: 'Publish locally',
    body: 'A signed manifest you can verify anytime.',
  },
  {
    n: '3',
    title: 'Go permanent later',
    body: 'Add IPFS or Arweave only when you want to.',
  },
] as const

export default function GettingStartedImmutableReleasesPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-16">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          ~5 minutes
        </Tag>
      </div>

      <header className="not-prose mb-8 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
          Immutable releases
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Ship something you can verify forever — starting with a safe dry-run.
          No wallets. No daemons. Just a first win.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="#try-it-in-one-command" arrow="right">
            <>Try the dry-run</>
          </Button>
          <Button href="/vision/immutable-releases" variant="outline">
            <>Why this exists</>
          </Button>
        </div>
      </header>

      <div className="not-prose mb-10">
        <Note>
          <strong>Start here.</strong> The dry-run below is the same flow CI
          uses. Skip wallets, IPFS, and Arweave until you outgrow local mode.
        </Note>
      </div>

      <ol className="not-prose mb-12 grid gap-6 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, index) => (
          <li key={step.n} className="relative min-w-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-4 left-[calc(50%+1.25rem)] hidden h-px w-[calc(100%-1.5rem)] bg-gradient-to-r from-claw-cyan/40 to-transparent sm:block"
              />
            ) : null}
            <div className="flex items-start gap-3 sm:flex-col sm:items-start sm:gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-claw-cyan/15 text-sm font-semibold text-[#0e7490] dark:bg-claw-cyan/20 dark:text-claw-cyan">
                {step.n}
              </span>
              <div>
                <p className="text-base font-semibold text-zinc-950 dark:text-white">
                  {step.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {step.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <AgentMarkdownDocBody
        path="/getting-started/immutable-releases"
        className="flex-auto [&_h1]:sr-only"
      />

      <p className="not-prose mt-12 text-sm text-zinc-500 dark:text-zinc-500">
        Source:{' '}
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/immutable-releases.md"
          className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-300"
        >
          docs/getting-started/immutable-releases.md
        </a>
      </p>
    </article>
  )
}
