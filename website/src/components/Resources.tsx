'use client'

import { Heading } from '@/components/Heading'
import { ReferenceResourceCard } from '@/components/ReferenceResourceCard'
import { exampleSiteCards, referenceHubCards } from '@/lib/docs-hub-data'

export function Resources() {
  return (
    <>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="examples">
          Examples & walkthroughs
        </Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Session notes and engineering narratives — see{' '}
          <a
            href="/examples"
            className="font-medium text-zinc-900 underline underline-offset-2 dark:text-claw-cyan-bright"
          >
            all examples
          </a>
          .
        </p>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5">
          {exampleSiteCards.slice(0, 3).map((resource) => (
            <ReferenceResourceCard key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="reference">
          Reference
        </Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Protocol, tools, and configuration — browse the{' '}
          <a
            href="/reference"
            className="font-medium text-zinc-900 underline underline-offset-2 dark:text-claw-cyan-bright"
          >
            full reference hub
          </a>
          .
        </p>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5">
          {referenceHubCards.slice(0, 6).map((resource) => (
            <ReferenceResourceCard key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
    </>
  )
}
