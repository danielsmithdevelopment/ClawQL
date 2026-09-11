import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'

export function Document({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={clsx(
        [
          'space-y-4 text-sm/7 text-mist-700 dark:text-mist-400',
          '[&_a]:font-semibold [&_a]:text-mist-950 [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-white',
          '[&_h2]:text-base/8 [&_h2]:font-medium [&_h2]:text-mist-950 [&_h2]:not-first:mt-10 dark:[&_h2]:text-white',
          '[&_h3]:mt-8 [&_h3]:text-sm/7 [&_h3]:font-semibold [&_h3]:text-mist-950 dark:[&_h3]:text-white',
          '[&_h4]:mt-6 [&_h4]:text-sm/7 [&_h4]:font-semibold [&_h4]:text-mist-800 dark:[&_h4]:text-mist-200',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-mist-300 [&_blockquote]:pl-4 [&_blockquote]:text-mist-800 [&_blockquote]:italic dark:[&_blockquote]:border-mist-600 dark:[&_blockquote]:text-mist-200',
          '[&_li]:pl-2 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_strong]:font-semibold [&_strong]:text-mist-950 dark:[&_strong]:text-white',
          '[&_ul]:list-[square] [&_ul]:pl-6 [&_ul]:marker:text-mist-400 dark:[&_ul]:marker:text-mist-600',
          '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs/6',
          '[&_th]:border-b [&_th]:border-mist-200 [&_th]:py-2 [&_th]:pr-3 [&_th]:align-top [&_th]:font-semibold [&_th]:text-mist-950 dark:[&_th]:border-white/15 dark:[&_th]:text-white',
          '[&_td]:border-b [&_td]:border-mist-100 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top dark:[&_td]:border-white/10',
          '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-mist-950/5 [&_pre]:p-4 [&_pre]:text-xs/5 dark:[&_pre]:bg-white/5',
        ].join(' '),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
