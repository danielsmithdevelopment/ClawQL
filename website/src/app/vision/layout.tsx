import type { ReactNode } from 'react'

/**
 * Pin /vision/* to static generation so HTML is fully renderable at the edge
 * without relying on RSC streaming for primary long-form content.
 */
export const dynamic = 'force-static'

export default function VisionLayout({ children }: { children: ReactNode }) {
  return children
}
