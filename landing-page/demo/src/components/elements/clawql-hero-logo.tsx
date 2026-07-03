import { clsx } from 'clsx/lite'
import Image from 'next/image'
import type { ComponentProps } from 'react'

export function ClawQLHeroLogo({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={clsx(
        'relative mx-auto aspect-square w-full max-w-xs sm:max-w-sm lg:max-w-md',
        className,
      )}
      {...props}
    >
      <Image
        src="/ClawQL-logo.jpeg"
        alt="ClawQL"
        fill
        className="object-contain"
        sizes="(max-width: 640px) 320px, (max-width: 1024px) 384px, 448px"
        priority
      />
    </div>
  )
}
