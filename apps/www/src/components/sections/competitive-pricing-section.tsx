import { ComparisonRowTh, ComparisonTable, ComparisonTd, ComparisonTh } from '@/components/elements/comparison-table'
import { Link } from '@/components/elements/link'
import {
  competitiveHeadline,
  competitiveHonestyNotes,
  competitiveSummary,
  competitorColumns,
  competitorFeatureRows,
  gatewayOnlyNote,
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
              {benchmark.note ? <p className="text-xs/6 text-mist-600 dark:text-mist-400">{benchmark.note}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-mist-950/10 bg-mist-950/2.5 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-xl font-semibold text-mist-950 dark:text-white">{gatewayOnlyNote.title}</h3>
          <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">{gatewayOnlyNote.body}</p>
          <p className="mt-4 text-sm/7 text-mist-600 dark:text-mist-400">
            Head-to-head feature tables against named gateway-only products are paused until they are re-verified against
            current releases and offered for maintainer review. Product plan:{' '}
            <Link href="/cloud">/cloud</Link>.
          </p>
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
                {stackReplacementSummary.clawqlBusinessMax}
              </p>
              <p className="mt-2 text-sm/7 text-mist-700 dark:text-mist-400">{stackReplacementSummary.savingsNote}</p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-xs/6 text-mist-600 dark:text-mist-400">{stackReplacementSummary.disclaimer}</p>
      </Section>

      <Section
        id="competitor-features"
        eyebrow="Feature comparison"
        headline="ClawQL Business ($599/mo) vs IDP and VDR incumbents"
        subheadline={
          <p>
            Competitors typically sell IDP or VDR as separate products. ClawQL IDP tiers bundle both plus semantic
            search, MCP gateway, and agent memory. For gateway-only needs, see the note above.
          </p>
        }
      >
        <ComparisonTable minWidthClass="min-w-[720px]">
          <thead>
            <tr>
              <ComparisonTh className="pr-4 text-left">Feature</ComparisonTh>
              {competitorColumns.map((col) => (
                <ComparisonTh key={col} className="text-center font-semibold">
                  {col}
                </ComparisonTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitorFeatureRows.map((row) => (
              <tr key={row.feature} className="group border-t border-mist-950/5 dark:border-white/10">
                <ComparisonRowTh>
                  <div className="flex flex-col gap-1">
                    <span>{row.feature}</span>
                    {row.footnote ? (
                      <span className="text-xs/6 font-normal text-mist-600 dark:text-mist-600">{row.footnote}</span>
                    ) : null}
                  </div>
                </ComparisonRowTh>
                {competitorColumns.map((col) => (
                  <ComparisonTd key={col} className="text-center text-mist-700 dark:text-mist-400">
                    <CellValue value={row.values[col]} />
                  </ComparisonTd>
                ))}
              </tr>
            ))}
          </tbody>
        </ComparisonTable>
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
