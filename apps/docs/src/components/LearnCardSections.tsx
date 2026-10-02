'use client'

import { Heading } from '@/components/Heading'
import { ReferenceResourceCard } from '@/components/ReferenceResourceCard'
import { exampleSiteCards } from '@/lib/docs-hub-data'
import {
  learnModuleSiteCards,
  learnRelatedGuideSiteCards,
} from '@/lib/docs-site-card-data'

const cardGridClass =
  'not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5'

export function LearnCardSections() {
  return (
    <>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="how-to-guides">
          Learn modules
        </Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Curated walkthroughs under{' '}
          <strong className="font-semibold">/learn</strong>— the same links as{' '}
          <strong className="font-semibold">ClawQL Learn</strong> in the
          sidebar.
        </p>
        <div className={cardGridClass}>
          {learnModuleSiteCards.map((card) => (
            <ReferenceResourceCard key={card.href} resource={card} />
          ))}
        </div>
      </div>

      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="related-guides">
          Related guides
        </Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Install, specs, deployment, networking, and operations pages outside{' '}
          <strong className="font-semibold">/learn</strong> that pair with the
          modules above.
        </p>
        <div className={cardGridClass}>
          {learnRelatedGuideSiteCards.map((card) => (
            <ReferenceResourceCard key={card.href} resource={card} />
          ))}
        </div>
      </div>

      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="examples">
          Examples & walkthroughs
        </Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Session narratives and postmortems — see{' '}
          <a
            href="/examples"
            className="font-medium underline underline-offset-2"
          >
            all examples
          </a>
          .
        </p>
        <div className={cardGridClass}>
          {exampleSiteCards.slice(0, 3).map((card) => (
            <ReferenceResourceCard key={card.href} resource={card} />
          ))}
        </div>
      </div>
    </>
  )
}
