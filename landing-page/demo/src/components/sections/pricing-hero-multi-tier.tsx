import { ElTabGroup, ElTabList, ElTabPanels } from '@tailwindplus/elements/react'
import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'
import { Container } from '../elements/container'
import { Heading } from '../elements/heading'
import { Text } from '../elements/text'
import { CheckmarkIcon } from '../icons/checkmark-icon'

export function Plan({
  name,
  price,
  period,
  subheadline,
  badge,
  features,
  cta,
  className,
}: {
  name: ReactNode
  price: ReactNode
  period?: ReactNode
  subheadline: ReactNode
  badge?: ReactNode
  features: ReactNode[]
  cta: ReactNode
} & ComponentProps<'div'>) {
  return (
    <div
      className={clsx(
        'flex flex-col justify-between gap-6 rounded-xl bg-mist-950/2.5 p-6 sm:items-start dark:bg-white/5',
        className,
      )}
    >
      <div className="self-stretch">
        <div className="flex flex-col gap-2">
          {badge && (
            <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">{badge}</p>
          )}
          <h3 className="text-xl/8 font-medium tracking-tight text-mist-950 dark:text-white">{name}</h3>
        </div>
        <p className="mt-1 inline-flex gap-1 text-base/7">
          <span className="text-mist-950 dark:text-white">{price}</span>
          {period && <span className="text-mist-500 dark:text-mist-500">{period}</span>}
        </p>
        <div className="mt-4 flex flex-col gap-4 text-sm/6 text-mist-700 dark:text-mist-400">{subheadline}</div>
        <ul className="mt-4 space-y-2 text-sm/6 text-mist-700 dark:text-mist-400">
          {features.map((feature, index) => (
            <li key={index} className="flex gap-4">
              <CheckmarkIcon className="h-lh shrink-0 stroke-mist-950 dark:stroke-white" />
              <p>{feature}</p>
            </li>
          ))}
        </ul>
      </div>
      {cta && <div className="self-start">{cta}</div>}
    </div>
  )
}

export function PricingHeroMultiTier<T extends string>({
  eyebrow,
  headline,
  subheadline,
  options,
  plans,
  footer,
  annualSavingsLabel,
  className,
  ...props
}: {
  eyebrow?: ReactNode
  headline: ReactNode
  subheadline: ReactNode
  options: readonly T[]
  plans: Record<T, ReactNode>
  footer?: ReactNode
  /** Shown on the annual billing toggle — e.g. "2 months free". */
  annualSavingsLabel?: string
} & ComponentProps<'section'>) {
  return (
    <section className={clsx('py-16', className)} {...props}>
      <ElTabGroup>
        <Container className="flex flex-col gap-16">
          <div className="flex flex-col items-center gap-6">
            {eyebrow}
            <Heading>{headline}</Heading>
            <Text size="lg" className="flex max-w-xl flex-col gap-4 text-center">
              {subheadline}
            </Text>
            <ElTabList className="flex items-center gap-1 rounded-full bg-mist-950/5 p-1 dark:bg-white/5">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="rounded-full px-4 py-1 text-sm/7 font-medium text-mist-950 aria-selected:bg-mist-950 aria-selected:text-white dark:text-white dark:aria-selected:bg-white/10 dark:aria-selected:text-white"
                >
                  {option}
                  {annualSavingsLabel && option === 'Yearly' ? (
                    <span className="ml-1.5 rounded-full bg-emerald-600/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                      {annualSavingsLabel}
                    </span>
                  ) : null}
                </button>
              ))}
            </ElTabList>
          </div>
          <ElTabPanels>
            {options.map((option) => (
              <div
                key={option}
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                {plans[option]}
              </div>
            ))}
          </ElTabPanels>
          {footer}
        </Container>
      </ElTabGroup>
    </section>
  )
}
