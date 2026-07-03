import { clsx } from 'clsx/lite'
import { type ComponentProps } from 'react'

export function Subheading({ children, className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      className={clsx(
        'font-display text-3xl/9 font-medium tracking-tight text-pretty text-mist-950 sm:text-[2rem]/10 dark:text-white',
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  )
}
