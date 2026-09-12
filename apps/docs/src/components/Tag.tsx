import clsx from 'clsx'

const variantStyles = {
  small: '',
  medium: 'rounded-lg px-1.5 ring-1 ring-inset',
}

const colorStyles = {
  claw: {
    small: 'text-[#0e7490] dark:text-claw-cyan',
    medium:
      'ring-claw-cyan/35 bg-claw-cyan/10 text-[#0e7490] dark:text-claw-cyan dark:ring-claw-cyan/30',
  },
  sky: {
    small: 'text-sky-800 dark:text-sky-400',
    medium:
      'ring-sky-300 bg-sky-50 text-sky-800 dark:ring-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300',
  },
  amber: {
    // Amber-800 on warm fill meets WCAG AA for small mono labels (amber-500 does not).
    small: 'text-amber-800 dark:text-amber-300',
    medium:
      'ring-amber-400/50 bg-amber-50 text-amber-800 dark:ring-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
  },
  rose: {
    small: 'text-rose-800 dark:text-rose-400',
    medium:
      'ring-rose-300 bg-rose-50 text-rose-800 dark:ring-rose-500/20 dark:bg-rose-400/10 dark:text-rose-300',
  },
  zinc: {
    small: 'text-zinc-600 dark:text-zinc-300',
    medium:
      'ring-zinc-200 bg-zinc-50 text-zinc-600 dark:ring-zinc-500/20 dark:bg-zinc-400/10 dark:text-zinc-300',
  },
}

const valueColorMap = {
  GET: 'claw',
  POST: 'sky',
  PUT: 'amber',
  DELETE: 'rose',
} as Record<string, keyof typeof colorStyles>

export function Tag({
  children,
  variant = 'medium',
  color = valueColorMap[children] ?? 'claw',
}: {
  children: keyof typeof valueColorMap & (string | {})
  variant?: keyof typeof variantStyles
  color?: keyof typeof colorStyles
}) {
  return (
    <span
      className={clsx(
        'font-mono text-[0.625rem]/6 font-semibold',
        variantStyles[variant],
        colorStyles[color][variant],
      )}
    >
      {children}
    </span>
  )
}
