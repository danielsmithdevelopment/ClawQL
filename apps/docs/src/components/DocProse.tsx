import { OnThisPage } from '@/components/OnThisPage'
import { Prose } from '@/components/Prose'

/**
 * Shared prose column for generated long-form docs (agent-setup, vision, …).
 * Includes the in-page TOC; a page-wide claim guard dedupes if the MDX
 * `wrapper` also mounts `OnThisPage`.
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
