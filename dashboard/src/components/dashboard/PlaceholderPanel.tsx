import { cn } from '@/lib/utils'

export function PlaceholderPanel({
  title,
  description,
  className,
}: {
  title: string
  description: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center',
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="max-w-md text-sm text-zinc-500">{description}</p>
    </div>
  )
}
