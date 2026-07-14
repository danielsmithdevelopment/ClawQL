import { OnThisPage } from '@/components/OnThisPage'
import { Prose } from '@/components/Prose'

/**
 * Shared prose column for generated long-form docs (agent-setup, vision, …).
 * Includes the in-page table of contents when the route has ≥2 h2 sections.
 */
export function DocProse({
  children,
  className = 'flex-auto',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <Prose className={className}>
      <OnThisPage />
      {children}
    </Prose>
  )
}
