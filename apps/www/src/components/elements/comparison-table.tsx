import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'

/**
 * Marketing comparison / scorecard tables for `apps/www`.
 *
 * Same Tailwind Plus Oatmeal recipe as `plan-comparison-table` and
 * `competitive-pricing-section`. Do not import shadcn/ui here — ADR 0012
 * keeps shadcn in `apps/dashboard` (product console only).
 */

/**
 * Shared class tokens — prefer these over one-off table chrome.
 *
 * No position:sticky: these tables sit in overflow-x-auto wrappers, and sticky
 * thead cells paint over / through body rows while scrolling (Capability matrix).
 * Headers scroll away with the table; keep solid mist bg + padding only.
 */
export const comparisonTableClass = 'w-full border-collapse text-left text-sm/5'
export const comparisonThClass = clsx(
  'bg-mist-100 px-4 py-5 font-medium text-mist-950',
  'border-b border-mist-950/15',
  'dark:bg-mist-950 dark:text-white dark:border-white/15',
)
export const comparisonTdClass = 'px-4 py-4'
export const comparisonRowThClass = 'px-4 py-4 font-normal text-mist-700 dark:text-mist-400'

export function ComparisonTable({
  className,
  minWidthClass,
  children,
  ...props
}: ComponentProps<'table'> & { minWidthClass?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx(comparisonTableClass, minWidthClass, className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function ComparisonTh({ className, ...props }: ComponentProps<'th'>) {
  return <th className={clsx(comparisonThClass, className)} {...props} />
}

export function ComparisonTd({ className, ...props }: ComponentProps<'td'>) {
  return <td className={clsx(comparisonTdClass, className)} {...props} />
}

export function ComparisonRowTh({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="row" className={clsx(comparisonRowThClass, className)} {...props} />
}
