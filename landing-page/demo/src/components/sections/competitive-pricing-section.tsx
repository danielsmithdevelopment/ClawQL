import { Link } from '@/components/elements/link'
import {
  competitiveHeadline,
  competitiveHonestyNotes,
  competitiveSummary,
  competitorColumns,
  competitorFeatureRows,
  executorBenchmark,
  executorComparisonRows,
  realEstateVertical,
  stackReplacementSummary,
  tcoBenchmarks,
} from '@/lib/competitive-pricing'
import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'
import { Section } from '../elements/section'
import { CheckmarkIcon } from '../icons/checkmark-icon'
import { MinusIcon } from '../icons/minus-icon'

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 font-medium text-mist-950 dark:text-white">
        <CheckmarkIcon aria-hidden className="stroke-mist-950 dark:stroke-white" />
        <span>Included</span>
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 text-mist-600">
        <MinusIcon aria-hidden className="stroke-mist-500" />
        <span>—</span>
      </span>
    )
  }
  return <span>{value}</span>
}

export function CompetitivePricingSection({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={clsx('flex flex-col gap-16', className)} {...props}>
      <Section
        id="competitive"
        eyebrow="Competitive landscape"
        headline={competitiveHeadline}
        subheadline={<p>{competitiveSummary}</p>}
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {tcoBenchmarks.map((benchmark) => (
            <div key={benchmark.label} className="flex flex-col gap-3 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">
                {benchmark.label}
              </p>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{benchmark.scenario}</p>
              <div className="flex flex-col gap-1 text-sm/7">
                <p>
                  <span className="text-mist-600">Incumbent: </span>
                  <span className="font-medium text-mist-950 dark:text-white">{benchmark.incumbent}</span>
                </p>
                <p>
                  <span className="text-mist-600">ClawQL: </span>
                  <span className="font-semibold text-mist-950 dark:text-white">{benchmark.clawql}</span>
                </p>
              </div>
              <p className="text-xs/6 text-mist-600 dark:text-mist-400">{benchmark.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-mist-950/10 bg-mist-950/2.5 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-xl font-semibold text-mist-950 dark:text-white">
            vs {executorBenchmark.name} — a tool, not a platform
          </h3>
          <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">{executorBenchmark.positioning}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase">
                {executorBenchmark.name} pricing
              </p>
              <ul className="mt-2 space-y-1 text-sm/7 text-mist-700 dark:text-mist-400">
                {executorBenchmark.pricing.map((row) => (
                  <li key={row.tier}>
                    <span className="font-medium text-mist-950 dark:text-white">{row.tier}</span> {row.price} —{' '}
                    {row.includes}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase">ClawQL gateway tiers</p>
              <p className="mt-2 text-sm font-semibold text-mist-950 dark:text-white">
                {executorBenchmark.clawqlResponse.tiers}
              </p>
              <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">
                {executorBenchmark.clawqlResponse.advantage}
              </p>
              <p className="mt-2 text-sm/7 font-medium text-mist-800 dark:text-mist-200">
                {executorBenchmark.clawqlResponse.closing}
              </p>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm/5">
              <thead>
                <tr>
                  <th className="py-3 pr-4 font-medium text-mist-950 dark:text-white">Dimension</th>
                  <th className="px-3 py-3 font-medium text-mist-950 dark:text-white">{executorBenchmark.name}</th>
                  <th className="px-3 py-3 font-medium text-mist-950 dark:text-white">ClawQL</th>
                </tr>
              </thead>
              <tbody>
                {executorComparisonRows.map((row) => (
                  <tr key={row.dimension} className="border-t border-mist-950/5 dark:border-white/10">
                    <th scope="row" className="py-3 pr-4 font-normal text-mist-700 dark:text-mist-400">
                      {row.dimension}
                    </th>
                    <td className="px-3 py-3 text-mist-600 dark:text-mist-600">{row.executor}</td>
                    <td className="px-3 py-3 text-mist-700 dark:text-mist-400">{row.clawql}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-mist-950/10 bg-mist-950/2.5 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-xl font-semibold text-mist-950 dark:text-white">{realEstateVertical.headline}</h3>
          <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">{realEstateVertical.problem}</p>
          <p className="mt-4 text-sm/7 text-mist-700 dark:text-mist-400">{realEstateVertical.clawqlPitch}</p>
          <p className="mt-4 text-sm font-medium text-mist-950 dark:text-white">{realEstateVertical.recommendedTier}</p>
          <ul className="mt-4 space-y-2 text-sm/7 text-mist-600 dark:text-mist-600">
            {realEstateVertical.competitors.map((c) => (
              <li key={c.name}>
                <span className="font-medium text-mist-800 dark:text-mist-200">{c.name}</span> ({c.pricing}) — {c.gap}
              </li>
            ))}
          </ul>
          <Link href={realEstateVertical.href} className="mt-4 inline-block text-sm font-medium">
            Real estate vertical →
          </Link>
        </div>

        <div className="mt-10 rounded-xl border border-mist-950/10 bg-mist-950/2.5 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-xl font-semibold text-mist-950 dark:text-white">{stackReplacementSummary.headline}</h3>
          <p className="mt-2 text-sm/7 text-mist-600 dark:text-mist-400">{stackReplacementSummary.profile}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase">Incumbent stack</p>
              <p className="mt-1 text-lg font-semibold text-mist-950 dark:text-white">
                {stackReplacementSummary.incumbentRange}
              </p>
              <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">
                {stackReplacementSummary.incumbentDetail}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase">ClawQL Business (IDP bundle)</p>
              <p className="mt-1 text-lg font-semibold text-mist-950 dark:text-white">
                {stackReplacementSummary.clawqlBusiness}
              </p>
              <p className="mt-1 text-sm/7 text-mist-600 dark:text-mist-400">
                Up to {stackReplacementSummary.clawqlBusinessMax}
              </p>
              <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">{stackReplacementSummary.savingsNote}</p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-xs/6 text-mist-600 dark:text-mist-400">
          Illustrative benchmarks from published competitor pricing bands (July 2026). Your volume and contract terms
          will differ — use these for order-of-magnitude comparison, not procurement quotes.
        </p>
      </Section>

      <Section
        id="competitor-features"
        eyebrow="Feature comparison"
        headline="ClawQL Business ($599/mo IDP bundle) vs IDP and VDR incumbents"
        subheadline={
          <p>
            Competitors typically sell IDP <em>or</em> VDR. ClawQL IDP tiers bundle both plus semantic search, MCP
            gateway, and agent memory. Gateway-only tiers are compared against executor.sh above.
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm/5">
            <thead>
              <tr>
                <th className="sticky top-(--scroll-padding-top) bg-mist-100 py-4 pr-4 font-medium text-mist-950 dark:bg-mist-950 dark:text-white">
                  Feature
                </th>
                {competitorColumns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-(--scroll-padding-top) bg-mist-100 px-3 py-4 text-center font-semibold text-mist-950 dark:bg-mist-950 dark:text-white"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competitorFeatureRows.map((row) => (
                <tr key={row.feature} className="group border-t border-mist-950/5 dark:border-white/10">
                  <th scope="row" className="py-4 pr-4 font-normal text-mist-700 dark:text-mist-400">
                    <div className="flex flex-col gap-1">
                      <span>{row.feature}</span>
                      {row.footnote ? (
                        <span className="text-xs/6 font-normal text-mist-600 dark:text-mist-600">{row.footnote}</span>
                      ) : null}
                    </div>
                  </th>
                  {competitorColumns.map((col) => (
                    <td key={col} className="px-3 py-4 text-center text-mist-700 dark:text-mist-400">
                      <CellValue value={row.values[col]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="competitive-honesty" eyebrow="Competitive positioning" headline="What to expect in evaluations">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {competitiveHonestyNotes.map((note) => (
            <div key={note.title} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{note.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{note.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
