import clsx from 'clsx'
import Image from 'next/image'

/**
 * Brand photo (`public/ClawQL-logo.jpeg`) cropped to the upper area, with **ClawQL** title beside it.
 * Intrinsic width/height keep the mark readable even if CSS has not applied yet (FOUC / failed CSS).
 */
export function Logo({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={clsx('flex shrink-0 items-center gap-2.5 sm:gap-3', className)}
      {...rest}
    >
      <Image
        src="/ClawQL-logo.jpeg"
        alt=""
        width={40}
        height={40}
        className="docs-logo-mark h-9 w-9 shrink-0 rounded-md object-cover object-top ring-1 ring-black/10 sm:h-10 sm:w-10 dark:ring-white/15"
        sizes="40px"
        priority
      />
      <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
        ClawQL
      </span>
    </div>
  )
}
