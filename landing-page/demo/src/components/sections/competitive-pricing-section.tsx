import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'
import { Section } from '../elements/section'
import { CheckmarkIcon } from '../icons/checkmark-icon'
import { MinusIcon } from '../icons/minus-icon'
import {
  competitorColumns,
  competitorFeatureRows,
  competitiveHeadline,
  competitiveHonestyNotes,
  competitiveSummary,
  tcoBenchmarks,
} from '@/lib/competitive-pricing'

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
      <span className="inline-flex items-center justify-center gap-1.5 text-mist-500">
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
              <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">
                {benchmark.label}
              </p>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{benchmark.scenario}</p>
              <div className="flex flex-col gap-1 text-sm/7">
                <p>
                  <span className="text-mist-500">Incumbent: </span>
                  <span className="font-medium text-mist-950 dark:text-white">{benchmark.incumbent}</span>
                </p>
                <p>
                  <span className="text-mist-500">ClawQL: </span>
                  <span className="font-semibold text-mist-950 dark:text-white">{benchmark.clawql}</span>
                </p>
              </div>
              <p className="text-xs/6 text-mist-500 dark:text-mist-400">{benchmark.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs/6 text-mist-500 dark:text-mist-400">
          Illustrative benchmarks from published competitor pricing bands (July 2026). Your volume and contract terms
          will differ — use these for order-of-magnitude comparison, not procurement quotes.
        </p>
      </Section>

      <Section
        id="competitor-features"
        eyebrow="Feature comparison"
        headline="ClawQL Business ($299/mo) vs IDP and VDR incumbents"
        subheadline={
          <p>
            Competitors typically sell IDP <em>or</em> VDR. ClawQL bundles both plus semantic search and MCP agent
            orchestration. Compare at the Business tier — our mid-market managed plan.
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
                  <th
                    scope="row"
                    className="py-4 pr-4 font-normal text-mist-700 dark:text-mist-400"
                  >
                    <div className="flex flex-col gap-1">
                      <span>{row.feature}</span>
                      {row.footnote ? (
                        <span className="text-xs/6 font-normal text-mist-500 dark:text-mist-500">{row.footnote}</span>
                      ) : null}
                    </div>
                  </th>
                  {competitorColumns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-4 text-center text-mist-700 dark:text-mist-400"
                    >
                      <CellValue value={row.values[col]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="competitive-honesty" eyebrow="Honest positioning" headline="What to expect in enterprise evaluations">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
