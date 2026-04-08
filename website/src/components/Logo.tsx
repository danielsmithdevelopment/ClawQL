import clsx from 'clsx'
import Image from 'next/image'

/**
 * Brand photo (`public/ClawQL-logo.jpeg`) cropped to the upper area, with **ClawQL** title beside it.
 * The full JPEG stacks wordmark under the art; the crop keeps the mark readable at small sizes.
 */
export function Logo({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center gap-2.5 sm:gap-3',
        className,
      )}
      {...rest}
    >
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10 sm:h-10 sm:w-10 dark:ring-white/15">
        <Image
          src="/ClawQL-logo.jpeg"
          alt=""
          fill
          className="object-cover object-top"
          sizes="40px"
          priority
        />
      </div>
      <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
        ClawQL
      </span>
    </div>
  )
}
