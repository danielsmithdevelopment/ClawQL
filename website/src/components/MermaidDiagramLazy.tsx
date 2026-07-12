'use client'

import dynamic from 'next/dynamic'

export const MermaidDiagramLazy = dynamic(
  () => import('@/components/MermaidDiagram').then((m) => m.MermaidDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="not-prose my-6 h-32 animate-pulse rounded-2xl bg-zinc-900/80 ring-1 ring-zinc-900/10 dark:ring-white/10" />
    ),
  },
)
