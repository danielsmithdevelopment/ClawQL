'use client'

import { useEffect, useId, useRef, useState } from 'react'

type MermaidDiagramProps = {
  chart: string
}

function readTheme(): 'dark' | 'default' {
  if (typeof document === 'undefined') return 'default'
  return document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'default'
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderId = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: readTheme(),
          securityLevel: 'strict',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        })
        const { svg: rendered } = await mermaid.render(
          `mermaid-${renderId}`,
          chart.trim(),
        )
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid render failed')
          setSvg(null)
        }
      }
    }

    void render()

    const observer = new MutationObserver(() => {
      void render()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [chart, renderId])

  if (error) {
    return (
      <div className="not-prose my-6 overflow-x-auto rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
        <p className="font-medium text-rose-300">Diagram failed to render</p>
        <pre className="mt-2 overflow-x-auto font-mono text-xs whitespace-pre text-zinc-300">
          {chart.trim()}
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="not-prose my-6 overflow-x-auto rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-zinc-900/10 dark:ring-white/10"
      aria-label="Architecture diagram"
    >
      {svg ? (
        <div
          className="mermaid-diagram flex min-w-min justify-center [&_svg]:h-auto [&_svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="h-32 animate-pulse rounded-lg bg-zinc-800/60" />
      )}
    </div>
  )
}
