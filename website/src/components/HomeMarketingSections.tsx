'use client'

// Deferred client islands reduce Worker SSR cost on the docs site (OpenNext + CF).
import dynamic from 'next/dynamic'

const HomeMarketingSectionsInner = dynamic(
  () => import('./HomeMarketingSectionsInner'),
  {
    ssr: false,
    loading: HomeMarketingSectionsSkeleton,
  },
)

/** Keeps `#guides` / `#case-studies` / `#reference` valid before client islands hydrate. */
function HomeMarketingSectionsSkeleton() {
  return (
    <div className="my-16 space-y-16 xl:max-w-none" aria-busy="true">
      <div>
        <h2
          id="guides"
          className="scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
        >
          Guides
        </h2>
        <div className="not-prose mt-4 border-t border-zinc-900/5 pt-10 dark:border-white/5">
          <div className="grid min-h-[12rem] grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/40"
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <h2
          id="case-studies"
          className="scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
        >
          Case studies
        </h2>
        <div className="not-prose mt-4 border-t border-zinc-900/5 pt-10 dark:border-white/5">
          <div className="grid min-h-[10rem] grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/40"
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <h2
          id="reference"
          className="scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
        >
          Reference
        </h2>
        <div className="not-prose mt-4 border-t border-zinc-900/5 pt-10 dark:border-white/5">
          <div className="grid min-h-[14rem] grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/40"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function HomeMarketingSections() {
  return <HomeMarketingSectionsInner />
}
