import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'
import { Link } from '../elements/link'
import { Section } from '../elements/section'
import { ArrowNarrowRightIcon } from '../icons/arrow-narrow-right-icon'
import type { securityEnforcementLayers, securityPillars } from '@/lib/security-marketing'

export function SecurityPillarCard({
  title,
  body,
  href,
  linkLabel,
  className,
  ...props
}: {
  title: string
  body: string
  href: string
  linkLabel: string
} & ComponentProps<'article'>) {
  return (
    <article
      className={clsx('flex flex-col justify-between gap-6 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5', className)}
      {...props}
    >
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-mist-950 dark:text-white">{title}</h3>
        <p className="text-sm/7 text-mist-700 dark:text-mist-400">{body}</p>
      </div>
      <Link href={href}>
        {linkLabel} <ArrowNarrowRightIcon />
      </Link>
    </article>
  )
}

export function SecurityEnforcementTable({
  layers,
  className,
  ...props
}: {
  layers: typeof securityEnforcementLayers
} & ComponentProps<'div'>) {
  return (
    <div
      className={clsx('overflow-hidden rounded-xl border border-mist-950/10 dark:border-white/10', className)}
      {...props}
    >
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-mist-950/10 bg-mist-950/2.5 dark:border-white/10 dark:bg-white/5">
            <th className="px-4 py-3 font-semibold text-mist-950 dark:text-white">Layer</th>
            <th className="px-4 py-3 font-semibold text-mist-950 dark:text-white">What happens</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((row) => (
            <tr key={row.layer} className="border-b border-mist-950/5 last:border-0 dark:border-white/5">
              <td className="px-4 py-3 font-medium text-mist-950 dark:text-white">{row.layer}</td>
              <td className="px-4 py-3 text-mist-700 dark:text-mist-400">{row.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SecuritySection({
  pillars,
  enforcementLayers,
  ...props
}: ComponentProps<typeof Section> & {
  pillars: typeof securityPillars
  enforcementLayers: typeof securityEnforcementLayers
}) {
  return (
    <Section {...props}>
      <div className="flex flex-col gap-10">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <SecurityPillarCard key={pillar.slug} {...pillar} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-mist-950 dark:text-white">Build → registry → cluster</h3>
          <SecurityEnforcementTable layers={enforcementLayers} />
        </div>
      </div>
    </Section>
  )
}
