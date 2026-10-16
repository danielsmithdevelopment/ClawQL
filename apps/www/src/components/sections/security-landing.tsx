import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import {
  securityStackAgentsNote,
  securityStackHardware,
  securityStackHeadline,
  securityStackPhases,
  securityStackSummary,
} from '@/lib/security-stack'
import { site } from '@/lib/site'

export function SecurityLanding() {
  return (
    <div className="flex flex-col">
      <Section
        id="security-hero"
        className="pt-10 pb-8 sm:pt-14 sm:pb-12"
        eyebrow="Security"
        headline={
          <>
            <span className="block font-display text-4xl/10 font-semibold tracking-tight text-mist-950 sm:text-5xl/12 dark:text-white">
              {site.name}
            </span>
            <span className="mt-3 block">{securityStackHeadline}</span>
          </>
        }
        subheadline={<p>{securityStackSummary}</p>}
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <ButtonLink href={`${site.urls.docs}/security`} size="lg">
              Security hub on docs
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/security/best-practices`} size="lg">
              32-module curriculum <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      >
        <figure className="overflow-hidden rounded-xl ring-1 ring-mist-950/10 dark:ring-white/10">
          <img
            src="/security/clawql-security-stack.jpg"
            alt="ClawQL security stack at a glance — nine layers from supply chain through tamper-evident audit, plus optional hardware foundation"
            width={1600}
            height={2000}
            className="h-auto w-full"
            loading="eager"
            decoding="async"
          />
          <figcaption className="sr-only">
            Infographic of the ClawQL defense-in-depth stack grouped by before it runs, every tool call, while it runs,
            always, and optional hardware underneath.
          </figcaption>
        </figure>
      </Section>

      {securityStackPhases.map((phase) => (
        <Section
          key={phase.id}
          id={phase.id}
          className="pt-6 sm:pt-8"
          eyebrow={phase.label}
          headline={
            phase.id === 'before'
              ? 'Admit only what you can prove'
              : phase.id === 'tool-call'
                ? 'Block bad calls before they run'
                : phase.id === 'runtime'
                  ? 'Contain, redact, and respond'
                  : 'Audit that cannot be silently rewritten'
          }
          subheadline={
            <p>
              {phase.layers.length === 1
                ? phase.layers[0]!.body
                : `Layers ${phase.layers[0]!.n}–${phase.layers[phase.layers.length - 1]!.n} in the stack.`}
            </p>
          }
        >
          <ol className="flex flex-col gap-8">
            {phase.layers.map((layer) => (
              <li
                key={layer.n}
                className="border-t border-mist-950/10 pt-8 first:border-t-0 first:pt-0 dark:border-white/10"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-6">
                  <span className="font-display text-sm font-semibold tracking-wide text-mist-500 tabular-nums">
                    {String(layer.n).padStart(2, '0')}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <h3 className="text-lg font-semibold text-mist-950 dark:text-white">{layer.title}</h3>
                    <p className="max-w-2xl text-sm/7 text-mist-700 dark:text-mist-400">{layer.body}</p>
                    <ul className="flex flex-wrap gap-2" aria-label={`${layer.title} controls`}>
                      {layer.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-md bg-mist-950/5 px-2.5 py-1 text-xs font-medium text-mist-800 dark:bg-white/10 dark:text-mist-200"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ))}

      <Section
        id="agents"
        className="pt-6 sm:pt-8"
        eyebrow="Agent model"
        headline={securityStackAgentsNote.title}
        subheadline={
          <p>{securityStackAgentsNote.body} — scopes and ATR decide what runs, not long-lived secrets in prompts.</p>
        }
      />

      <Section
        id="hardware"
        className="pt-6 sm:pt-10"
        eyebrow="Underneath"
        headline={securityStackHardware.title}
        subheadline={<p>{securityStackHardware.body}</p>}
      >
        <ul className="flex flex-wrap gap-2" aria-label="Hardware foundation">
          {securityStackHardware.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-md border border-dashed border-mist-950/20 px-2.5 py-1 text-xs font-medium text-mist-800 dark:border-white/20 dark:text-mist-200"
            >
              {tag}
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm/7 text-mist-700 dark:text-mist-400">
          When the operator itself cannot be in the trust model, see{' '}
          <Link href={`${site.urls.docs}/streams/clawql-tee`}>clawql-tee</Link> for attested Durable Object–compatible
          execution.
        </p>
      </Section>

      <CallToActionSimpleCentered
        id="cta"
        headline="Read the full security documentation"
        subheadline={
          <p>
            Golden-image pipelines, admission enforcement, and the agentic AI curriculum live on docs — this page is the
            stack map.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={`${site.urls.docs}/security`} size="lg">
              Open security hub
            </ButtonLink>
            <PlainButtonLink href={site.urls.signup} size="lg">
              Request access <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </div>
  )
}
