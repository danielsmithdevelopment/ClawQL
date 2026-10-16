import { Section } from '@/components/elements/section'
import { CheckmarkIcon } from '@/components/icons/checkmark-icon'
import { MinusIcon } from '@/components/icons/minus-icon'
import {
  cfBenchmarkHonesty,
  cfBenchmarkHeadline,
  cfBenchmarkMeta,
  cfBenchmarkSummary,
  cfHttpConcRows,
  cfStdioConcRows,
  cfTokenRows,
} from '@/lib/cloudflare-benchmarks'
import {
  BENCHMARK_VIDEO_META,
  BENCHMARK_VIDEO_SRC,
  gatewayBenchmarkClaim,
  gatewayBenchmarkHonesty,
  gatewayBenchmarkHeadline,
  gatewayBenchmarkLinks,
  gatewayBenchmarkMeta,
  gatewayBenchmarkSummary,
  gatewayCompetitorColumns,
  gatewayFeatureRows,
  latencyScorecardRows,
  tokenScorecardRows,
} from '@/lib/gateway-benchmarks'
import { site } from '@/lib/site'
import { clsx } from 'clsx/lite'
import NextLink from 'next/link'

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 font-medium text-mist-950 dark:text-white">
        <CheckmarkIcon aria-hidden className="stroke-mist-950 dark:stroke-white" />
        <span>Yes</span>
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
  return <span className="text-mist-800 dark:text-mist-200">{value}</span>
}

function BenchmarkVideoSlot() {
  if (BENCHMARK_VIDEO_SRC) {
    return (
      <div className="overflow-hidden rounded-xl bg-mist-950/5 ring-1 ring-mist-950/10 dark:bg-white/5 dark:ring-white/10">
        <video
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          src={BENCHMARK_VIDEO_SRC}
        >
          <track kind="captions" />
        </video>
      </div>
    )
  }

  return (
    <div
      className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_30%_20%,oklch(92%_0.02_214),transparent_55%),radial-gradient(ellipse_at_80%_80%,oklch(88%_0.03_200),oklch(96%_0.005_214))] ring-1 ring-mist-950/10 dark:bg-[radial-gradient(ellipse_at_30%_20%,oklch(22%_0.02_214),transparent_55%),radial-gradient(ellipse_at_80%_80%,oklch(18%_0.025_200),oklch(14.8%_0.004_228.8))] dark:ring-white/10"
      role="img"
      aria-label={`${BENCHMARK_VIDEO_META.placeholderLabel} — ${BENCHMARK_VIDEO_META.placeholderHint}`}
    >
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:48px_48px] text-mist-950 dark:text-white" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-mist-950/90 text-white shadow-lg shadow-mist-950/20 dark:bg-white/90 dark:text-mist-950">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
          </svg>
        </span>
        <p className="font-display text-lg font-medium tracking-tight text-mist-950 dark:text-white">
          {BENCHMARK_VIDEO_META.placeholderLabel}
        </p>
        <p className="max-w-md text-sm/6 text-mist-600 dark:text-mist-400">{BENCHMARK_VIDEO_META.placeholderHint}</p>
      </div>
    </div>
  )
}

export function BenchmarksLanding() {
  return (
    <div className="flex flex-col">
      <Section
        id="benchmarks-hero"
        className="pt-10 pb-8 sm:pt-14 sm:pb-10"
        eyebrow="Benchmarks"
        headline={
          <>
            <span className="block font-display text-4xl/10 font-semibold tracking-tight text-mist-950 sm:text-5xl/12 dark:text-white">
              {site.name}
            </span>
            <span className="mt-3 block">{cfBenchmarkHeadline}</span>
          </>
        }
        subheadline={<p>{cfBenchmarkSummary}</p>}
        cta={
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-mist-800 dark:text-mist-200">
              {cfBenchmarkMeta.measuredLabel}{' '}
              <span className="font-normal text-mist-600 dark:text-mist-400">
                · {cfBenchmarkMeta.boardLabel}
              </span>
            </p>
            <p className="text-xs/6 text-mist-600 dark:text-mist-400">
              Jump:{' '}
              <a href="#cf-tokens" className="underline decoration-mist-400/60 underline-offset-2 hover:text-mist-950 dark:hover:text-white">
                tokens
              </a>
              {' · '}
              <a href="#cf-http-conc" className="underline decoration-mist-400/60 underline-offset-2 hover:text-mist-950 dark:hover:text-white">
                HTTP concurrency
              </a>
              {' · '}
              <a href="#cf-stdio-conc" className="underline decoration-mist-400/60 underline-offset-2 hover:text-mist-950 dark:hover:text-white">
                stdio concurrency
              </a>
              {' · '}
              <a href="#token-board" className="underline decoration-mist-400/60 underline-offset-2 hover:text-mist-950 dark:hover:text-white">
                pets multiturn
              </a>
            </p>
          </div>
        }
      >
        {BENCHMARK_VIDEO_SRC ? <BenchmarkVideoSlot /> : null}
      </Section>

      <Section
        id="cf-tokens"
        className="pt-4 sm:pt-6"
        eyebrow="Cloudflare board"
        headline="Tokens, success, memory, session latency"
        subheadline={
          <p>
            Weighted mean tokens (definition + discovery + result + 5× code). Task success 1.0 on every arm below.
            Memory is process-tree anon MB. Label session transport when comparing latency.
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm/5">
            <caption className="sr-only">
              Cloudflare multiturn board: weighted tokens, memory, and session latency by arm
            </caption>
            <thead>
              <tr className="text-mist-950 dark:text-white">
                <th className="py-3 pr-3 font-medium">Arm</th>
                <th className="px-2 py-3 text-right font-medium">Weighted tokens</th>
                <th className="px-2 py-3 text-right font-medium">Anon MB</th>
                <th className="px-2 py-3 text-right font-medium">Session p50</th>
                <th className="px-2 py-3 text-center font-medium">Transport</th>
                <th className="px-2 py-3 text-center font-medium">Success</th>
              </tr>
            </thead>
            <tbody>
              {cfTokenRows.map((row) => (
                <tr
                  key={row.arm}
                  className={clsx(
                    'border-t border-mist-950/5 dark:border-white/10',
                    row.highlight && 'bg-mist-950/[0.03] dark:bg-white/[0.03]',
                  )}
                >
                  <th
                    scope="row"
                    className={clsx(
                      'py-3 pr-3 font-normal',
                      row.highlight ? 'font-semibold text-mist-950 dark:text-white' : 'text-mist-700 dark:text-mist-400',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{row.arm}</span>
                      {row.note ? (
                        <span className="max-w-md text-xs/5 font-normal text-mist-600 dark:text-mist-600">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <td
                    className={clsx(
                      'px-2 py-3 text-right tabular-nums font-semibold',
                      row.highlight ? 'text-mist-950 dark:text-white' : 'text-mist-800 dark:text-mist-200',
                    )}
                  >
                    {row.weighted}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.anonMb}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">
                    {row.sessionP50}
                  </td>
                  <td className="px-2 py-3 text-center text-mist-700 dark:text-mist-400">{row.transport}</td>
                  <td className="px-2 py-3 text-center font-medium text-mist-800 dark:text-mist-200">
                    {row.taskSuccess}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs/6 text-mist-600 dark:text-mist-400">
          Artifact: {cfBenchmarkMeta.artifactBoard}. Executor v2 is the promoted Executor column; v1 is the stable-release
          second column on the same mock.
        </p>
      </Section>

      <Section
        id="cf-http-conc"
        eyebrow="HTTP concurrency"
        headline="Clients sharing one Streamable HTTP server"
        subheadline={
          <p>
            Climb until p99 or errors break (no predetermined client caps). Clients sustained at 100 / 250 / 500 ms p99
            cutoffs · REPS=3 where noted.
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm/5">
            <caption className="sr-only">HTTP multiplex concurrency at p99 cutoffs</caption>
            <thead>
              <tr className="text-mist-950 dark:text-white">
                <th className="py-3 pr-3 font-medium">Arm</th>
                <th className="px-2 py-3 text-right font-medium">@100 ms</th>
                <th className="px-2 py-3 text-right font-medium">@250 ms</th>
                <th className="px-2 py-3 text-right font-medium">@500 ms</th>
                <th className="px-2 py-3 text-right font-medium">Peak RPS</th>
              </tr>
            </thead>
            <tbody>
              {cfHttpConcRows.map((row) => (
                <tr
                  key={row.arm}
                  className={clsx(
                    'border-t border-mist-950/5 dark:border-white/10',
                    row.highlight && 'bg-mist-950/[0.03] dark:bg-white/[0.03]',
                  )}
                >
                  <th
                    scope="row"
                    className={clsx(
                      'py-3 pr-3 font-normal',
                      row.highlight ? 'font-semibold text-mist-950 dark:text-white' : 'text-mist-700 dark:text-mist-400',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{row.arm}</span>
                      {row.note ? (
                        <span className="max-w-md text-xs/5 font-normal text-mist-600 dark:text-mist-600">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at100}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at250}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at500}</td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold text-mist-950 dark:text-white">
                    {row.peakRps}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs/6 text-mist-600 dark:text-mist-400">
          Artifact: {cfBenchmarkMeta.artifactHttp}. Executor v1 is not in this table (stdio MCP).
        </p>
      </Section>

      <Section
        id="cf-stdio-conc"
        eyebrow="Stdio concurrency"
        headline="One MCP process per client"
        subheadline={
          <p>
            Fair topology for Executor v1 stable. ClawQL and Executor v1 each spawn one stdio MCP process per client.
            Memory is the sum across all processes (+ shared daemon for v1).
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm/5">
            <caption className="sr-only">Stdio process-per-client concurrency at p99 cutoffs</caption>
            <thead>
              <tr className="text-mist-950 dark:text-white">
                <th className="py-3 pr-3 font-medium">Arm</th>
                <th className="px-2 py-3 text-right font-medium">@100 ms</th>
                <th className="px-2 py-3 text-right font-medium">@250 ms</th>
                <th className="px-2 py-3 text-right font-medium">@500 ms</th>
                <th className="px-2 py-3 text-right font-medium">Peak RPS</th>
              </tr>
            </thead>
            <tbody>
              {cfStdioConcRows.map((row) => (
                <tr
                  key={row.arm}
                  className={clsx(
                    'border-t border-mist-950/5 dark:border-white/10',
                    row.highlight && 'bg-mist-950/[0.03] dark:bg-white/[0.03]',
                  )}
                >
                  <th
                    scope="row"
                    className={clsx(
                      'py-3 pr-3 font-normal',
                      row.highlight ? 'font-semibold text-mist-950 dark:text-white' : 'text-mist-700 dark:text-mist-400',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{row.arm}</span>
                      {row.note ? (
                        <span className="max-w-md text-xs/5 font-normal text-mist-600 dark:text-mist-600">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at100}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at250}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-800 dark:text-mist-200">{row.at500}</td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold text-mist-950 dark:text-white">
                    {row.peakRps}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs/6 text-mist-600 dark:text-mist-400">
          Artifact: {cfBenchmarkMeta.artifactStdio}. Do not mix these cells with the HTTP multiplex table.
        </p>
      </Section>

      <Section id="cf-honesty" eyebrow="How to read the Cloudflare board" headline="Claim bounds">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {cfBenchmarkHonesty.map((note) => (
            <div key={note.title} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{note.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{note.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="competitive-matrix"
        className="pt-10 sm:pt-14"
        eyebrow="Also measured"
        headline={gatewayBenchmarkHeadline}
        subheadline={<p>{gatewayBenchmarkSummary}</p>}
      >
        <p className="mb-6 text-sm font-medium text-mist-800 dark:text-mist-200">
          {gatewayBenchmarkClaim}{' '}
          <span className="font-normal text-mist-600 dark:text-mist-400">
            · {gatewayBenchmarkMeta.measuredLabel} · {gatewayBenchmarkMeta.multiturnLabel}
          </span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm/5">
            <caption className="sr-only">
              Competitive feature matrix comparing ClawQL, Executor, MCPJungle, and agentgateway
            </caption>
            <thead>
              <tr>
                <th className="sticky top-(--scroll-padding-top) bg-mist-100 py-4 pr-4 font-medium text-mist-950 dark:bg-mist-950 dark:text-white">
                  Capability
                </th>
                {gatewayCompetitorColumns.map((col) => (
                  <th
                    key={col}
                    className={clsx(
                      'sticky top-(--scroll-padding-top) bg-mist-100 px-3 py-4 text-center font-semibold dark:bg-mist-950',
                      col === 'ClawQL' ? 'text-mist-950 dark:text-white' : 'text-mist-800 dark:text-mist-200',
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gatewayFeatureRows.map((row) => (
                <tr key={row.feature} className="border-t border-mist-950/5 dark:border-white/10">
                  <th scope="row" className="py-4 pr-4 font-normal text-mist-700 dark:text-mist-400">
                    <div className="flex flex-col gap-1">
                      <span>{row.feature}</span>
                      {row.footnote ? (
                        <span className="text-xs/6 font-normal text-mist-600 dark:text-mist-600">{row.footnote}</span>
                      ) : null}
                    </div>
                  </th>
                  {gatewayCompetitorColumns.map((col) => (
                    <td
                      key={col}
                      className={clsx(
                        'px-3 py-4 text-center',
                        col === 'ClawQL'
                          ? 'bg-mist-950/[0.03] text-mist-700 dark:bg-white/[0.03] dark:text-mist-300'
                          : 'text-mist-700 dark:text-mist-400',
                      )}
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

      <Section
        id="token-board"
        eyebrow="Pets multiturn scoreboard"
        headline="12-turn I/O tokens — equal task success"
        subheadline={
          <p>
            <code className="text-mist-800 dark:text-mist-200">combined @12 = definitions + Σ discovery + Σ results</code>
            . Earlier equal-arm pets catalog board (separate fixture from the Cloudflare zone-audit board above).
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm/5">
            <caption className="sr-only">Multi-turn token scorecard across gateway arms</caption>
            <thead>
              <tr className="text-mist-950 dark:text-white">
                <th className="py-3 pr-3 font-medium">Arm</th>
                <th className="px-2 py-3 text-right font-medium">Defs</th>
                <th className="px-2 py-3 text-right font-medium">Σ Disc</th>
                <th className="px-2 py-3 text-right font-medium">Σ Res</th>
                <th className="px-2 py-3 text-right font-medium">Combined</th>
                <th className="px-2 py-3 text-right font-medium">vs direct</th>
                <th className="px-2 py-3 text-right font-medium">Flow p50</th>
                <th className="px-2 py-3 text-right font-medium">Flow p999</th>
                <th className="px-2 py-3 text-right font-medium">RSS</th>
                <th className="px-2 py-3 text-center font-medium">Task</th>
              </tr>
            </thead>
            <tbody>
              {tokenScorecardRows.map((row) => (
                <tr
                  key={row.arm}
                  className={clsx(
                    'border-t border-mist-950/5 dark:border-white/10',
                    row.highlight && 'bg-mist-950/[0.03] dark:bg-white/[0.03]',
                  )}
                >
                  <th
                    scope="row"
                    className={clsx(
                      'py-3 pr-3 font-normal',
                      row.highlight ? 'font-semibold text-mist-950 dark:text-white' : 'text-mist-700 dark:text-mist-400',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{row.arm}</span>
                      {row.note ? (
                        <span className="max-w-xs text-xs/5 font-normal text-mist-600 dark:text-mist-600">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.definitions}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.discovery}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.results}</td>
                  <td
                    className={clsx(
                      'px-2 py-3 text-right tabular-nums font-semibold',
                      row.highlight ? 'text-mist-950 dark:text-white' : 'text-mist-800 dark:text-mist-200',
                    )}
                  >
                    {row.combined}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.vsDirect}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.flowP50}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.flowP999}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.rssMed}</td>
                  <td className="px-2 py-3 text-center font-medium text-mist-800 dark:text-mist-200">
                    {row.taskSuccess}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs/6 text-mist-600 dark:text-mist-400">
          Artifacts: {gatewayBenchmarkMeta.artifactMultiturn} · {gatewayBenchmarkMeta.artifactExecutorV2}
        </p>
      </Section>

      <Section
        id="latency-board"
        eyebrow="Latency board"
        headline="Interleaved e2e and governed gateway cost"
        subheadline={
          <p>
            {gatewayBenchmarkMeta.latencyLabel}. Columns show p50 / p95 / p99 / <strong>p999</strong> (ms).
          </p>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm/5">
            <caption className="sr-only">Interleaved latency scorecard</caption>
            <thead>
              <tr className="text-mist-950 dark:text-white">
                <th className="py-3 pr-3 font-medium">Arm</th>
                <th className="px-2 py-3 font-medium">e2e p50–p999</th>
                <th className="px-2 py-3 font-medium">Gateway cost p50/p99/p999</th>
                <th className="px-2 py-3 text-right font-medium">RSS med</th>
                <th className="px-2 py-3 text-right font-medium">List tok</th>
                <th className="px-2 py-3 text-right font-medium">Invoked</th>
                <th className="px-2 py-3 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {latencyScorecardRows.map((row) => (
                <tr
                  key={row.arm}
                  className={clsx(
                    'border-t border-mist-950/5 dark:border-white/10',
                    row.highlight && 'bg-mist-950/[0.03] dark:bg-white/[0.03]',
                  )}
                >
                  <th
                    scope="row"
                    className={clsx(
                      'py-3 pr-3 font-normal',
                      row.highlight ? 'font-semibold text-mist-950 dark:text-white' : 'text-mist-700 dark:text-mist-400',
                    )}
                  >
                    {row.arm}
                  </th>
                  <td className="px-2 py-3 tabular-nums text-mist-700 dark:text-mist-400">{row.e2e}</td>
                  <td className="px-2 py-3 tabular-nums text-mist-700 dark:text-mist-400">{row.gatewayCost}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.rssMed}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.listTok}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">
                    {row.invokedSchema}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-mist-700 dark:text-mist-400">{row.resultTok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs/6 text-mist-600 dark:text-mist-400">
          Artifact: {gatewayBenchmarkMeta.artifactLatency}.
        </p>
      </Section>

      <Section id="honesty" eyebrow="Pets board claim bounds" headline="How to read the multiturn board">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {gatewayBenchmarkHonesty.map((note) => (
            <div key={note.title} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{note.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{note.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="deep-boards"
        eyebrow="Deep boards"
        headline="Open the full artifacts"
        subheadline={<p>Static boards and docs hold the equal-arm contract and regenerate commands.</p>}
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {gatewayBenchmarkLinks.map((item) => (
            <li key={item.href}>
              <NextLink
                href={item.href}
                className="flex flex-col gap-1 rounded-xl bg-mist-950/2.5 p-6 transition hover:bg-mist-950/5 dark:bg-white/5 dark:hover:bg-white/8"
              >
                <span className="font-semibold text-mist-950 dark:text-white">{item.label}</span>
                <span className="text-sm/6 text-mist-600 dark:text-mist-400">{item.detail}</span>
              </NextLink>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
