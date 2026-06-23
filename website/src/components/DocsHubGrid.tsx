'use client'

import type { ReferenceCard } from '@/components/ReferenceResourceCard'
import { ReferenceResourceCard } from '@/components/ReferenceResourceCard'

const cardGridClass =
  'not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5'

export function DocsHubGrid({ cards }: { cards: Array<ReferenceCard> }) {
  return (
    <div className={cardGridClass}>
      {cards.map((card) => (
        <ReferenceResourceCard key={card.href} resource={card} />
      ))}
    </div>
  )
}
