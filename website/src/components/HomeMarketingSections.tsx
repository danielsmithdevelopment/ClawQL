'use client'

// Dynamic import + ssr:false keeps homepage marketing off the Worker HTML path (1102 mitigation).
// Skeleton preserves #guides / #examples anchors before client hydrate.
import dynamic from 'next/dynamic'

const HomeMarketingSectionsInner = dynamic(
  () => import('./HomeMarketingSectionsInner'),
  {
    loading: HomeMarketingSectionsSkeleton,
    ssr: false,
  },
)

/** Keeps `#guides` / `#case-studies` / `#reference` valid before client islands hydrate. */
function HomeMarketingSectionsSkeleton() {
  return (
    <div
      className="my-16 space-y-16 xl:max-w-none"
      aria-busy="true"
      aria-live="polite"
    >
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
          id="examples"
          className="scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
        >
          Examples
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
