import { clsx } from 'clsx/lite'
import Image from 'next/image'
import type { ComponentProps } from 'react'

export function ClawQLLogo({
  className,
  showWordmark = true,
  ...props
}: { showWordmark?: boolean } & ComponentProps<'div'>) {
  return (
    <div className={clsx('flex shrink-0 items-center gap-2.5', className)} {...props}>
      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10 dark:ring-white/15">
        <Image
          src="/ClawQL-logo.jpeg"
          alt=""
          fill
          className="object-cover object-top"
          sizes="28px"
          priority
        />
      </div>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight text-mist-950 dark:text-white">ClawQL</span>
      )}
    </div>
  )
}
