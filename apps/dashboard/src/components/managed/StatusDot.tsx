import { cn } from '@/lib/utils'

export function StatusDot({
  tone,
  className,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        tone === 'ok' && 'bg-emerald-500',
        tone === 'warn' && 'bg-amber-500',
        tone === 'danger' && 'bg-rose-500',
        tone === 'neutral' && 'bg-slate-400',
        className,
      )}
    />
  )
}
