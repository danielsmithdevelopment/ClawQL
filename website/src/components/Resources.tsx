'use client'

import { Heading } from '@/components/Heading'
import { ReferenceResourceCard } from '@/components/ReferenceResourceCard'
import { caseStudySiteCards, referenceSiteCards } from '@/lib/docs-site-card-data'

export function Resources() {
  return (
    <>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="case-studies">
          Case studies
        </Heading>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5">
          {caseStudySiteCards.map((resource) => (
            <ReferenceResourceCard key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="reference">
          Reference
        </Heading>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5">
          {referenceSiteCards.map((resource) => (
            <ReferenceResourceCard key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
    </>
  )
}
