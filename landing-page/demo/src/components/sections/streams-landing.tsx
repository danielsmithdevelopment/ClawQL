import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { Text } from '@/components/elements/text'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { site } from '@/lib/site'

import './streams-landing.css'

const STREAMS_SPEC = `${site.urls.docs}/streams/clawql-streams`
const DO_SPEC = `${site.urls.docs}/streams/clawql-durable-objects`
const ADAPTER_DOCS = `${site.urls.docs}/mcp/mcp-api-adapter`

const modes = [
  {
    name: 'Reactive',
    detail: 'Every event writes to WORM immediately — compliance-grade recording whether an agent wakes or not.',
  },
  {
    name: 'Ambient',
    detail: 'Events buffer in NATS and surface on the next MCP tool call — awareness without spawning a subprocess.',
  },
  {
    name: 'Autonomous',
    detail: 'A significance filter escalates only what matters into a full agent session with ClawQL tools and budget.',
  },
] as const

const compareRows = [
  {
    axis: 'Sovereignty',
    stripe: 'Internal only',
    anthropic: 'Anthropic-hosted',
    openai: 'Managed runtime',
    clawql: 'Self-host or Cloudflare',
  },
  {
    axis: 'Triggers',
    stripe: 'Slack reactions',
    anthropic: 'Cron / API',
    openai: 'Pipeline / API',
    clawql: 'WebSocket · NATS · webhook · cron',
  },
  {
    axis: 'Tools',
    stripe: 'Custom Toolshed',
    anthropic: 'Built-in + custom',
    openai: 'Built-in + custom',
    clawql: 'Any MCP surface via Protocol Fabric',
  },
  {
    axis: 'Audit',
    stripe: 'Internal',
    anthropic: 'Provider logs',
    openai: 'Provider logs',
    clawql: 'Operator-owned WORM Merkle trail',
  },
  {
    axis: 'Scale',
    stripe: 'Custom',
    anthropic: 'Session hours',
    openai: 'Managed',
    clawql: 'Durable Objects or K8s HPA',
  },
] as const

function StreamField() {
  return (
    <div className="streams-hero__visual" aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        <path
          className="streams-path streams-path--c"
          d="M-40 180 C 220 120, 380 260, 620 210 S 980 80, 1220 160 S 1480 280, 1520 240"
        />
        <path
          className="streams-path streams-path--a"
          d="M-60 320 C 180 280, 340 400, 560 360 S 900 240, 1120 320 S 1400 460, 1520 400"
        />
        <path
          className="streams-path streams-path--b"
          d="M-40 520 C 200 470, 360 610, 600 560 S 940 430, 1160 510 S 1420 650, 1520 590"
        />
        <path
          className="streams-path streams-path--a"
          d="M-80 680 C 160 620, 320 760, 540 710 S 880 580, 1100 660 S 1380 780, 1520 720"
        />
        <circle className="streams-node" cx="560" cy="360" r="5" />
        <circle className="streams-node streams-node--late" cx="1160" cy="510" r="6" />
        <circle className="streams-node" cx="900" cy="240" r="4" />
      </svg>
    </div>
  )
}

export function StreamsLanding() {
  return (
    <div className="streams-page">
      <section id="hero" className="streams-hero" aria-labelledby="streams-brand">
        <StreamField />
        <div className="streams-hero__content mx-auto w-full max-w-7xl px-6 sm:px-8">
          <div className="max-w-3xl">
            <h1 id="streams-brand" className="streams-brand">
              <span>ClawQL</span>
              Streams
            </h1>
            <p className="mt-6 max-w-xl font-display text-xl/8 font-medium tracking-tight text-balance text-white/90 sm:text-2xl/9">
              Event-driven autonomous agents you own — not a metered lab runtime.
            </p>
            <p className="mt-4 max-w-lg text-base/7 text-white/70 sm:text-lg/8">
              World events enter. WORM records everything. Significance filters decide when agents wake — with full MCP
              tools, virtual-key budgets, and Durable Object scale.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={STREAMS_SPEC} size="lg" color="light">
                Read the Streams spec
              </ButtonLink>
              <PlainButtonLink href={site.urls.signup} size="lg" color="light">
                Start free trial <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="modes"
        className="streams-section-band"
        eyebrow="Three delivery modes"
        headline="One event loop. Three ways to respond."
        subheadline={
          <p>
            The same subscription can audit continuously, keep agents ambiently aware, and escalate only when the world
            crosses a threshold — without a human opening a chat.
          </p>
        }
      >
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {modes.map((mode) => (
            <div key={mode.name} className="streams-mode">
              <h3 className="streams-mode__label">{mode.name}</h3>
              <Text className="mt-3">{mode.detail}</Text>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="fabric"
        eyebrow="Protocol Fabric"
        headline="Anything in. Anything out. MCP as the IR."
        subheadline={
          <p>
            ClawQL Core turns any API into MCP. <Link href={ADAPTER_DOCS}>mcp-api-adapter</Link> turns MCP back into
            OpenAPI, GraphQL, gRPC, CLI, or WebSocket. Streams wraps that fabric in an event loop so the bus can act
            without a human at the console.
          </p>
        }
      >
        <div className="streams-fabric max-w-3xl">
          <div className="streams-fabric__row">
            <span className="streams-fabric__chip">OpenAPI</span>
            <span className="streams-fabric__chip">GraphQL</span>
            <span className="streams-fabric__chip">gRPC</span>
            <span className="streams-fabric__chip">WebSocket</span>
            <span className="streams-fabric__chip">CLI</span>
            <span className="streams-fabric__arrow" aria-hidden>
              →
            </span>
            <span className="streams-fabric__core">ClawQL Core</span>
          </div>
          <div className="streams-fabric__row">
            <span className="streams-fabric__arrow" aria-hidden>
              ↓
            </span>
            <span className="streams-fabric__core">MCP · common IR</span>
            <span className="streams-fabric__arrow" aria-hidden>
              ↓
            </span>
          </div>
          <div className="streams-fabric__row">
            <span className="streams-fabric__core">mcp-api-adapter</span>
            <span className="streams-fabric__arrow" aria-hidden>
              →
            </span>
            <span className="streams-fabric__chip">OpenAPI</span>
            <span className="streams-fabric__chip">GraphQL</span>
            <span className="streams-fabric__chip">gRPC</span>
            <span className="streams-fabric__chip">WebSocket</span>
            <span className="streams-fabric__chip">CLI</span>
          </div>
        </div>
        <Text className="mt-10 max-w-2xl">
          ESB lesson, agent era: N×M protocol integrations collapse to N+M. Streams is how the fabric reacts to
          webhooks, NATS topics, cron, and live sockets — not only interactive MCP clients.
        </Text>
      </Section>

      <Section
        id="scale"
        className="streams-section-band"
        eyebrow="Durable Objects · Kubernetes"
        headline="Infinite session scale without losing the audit trail"
        subheadline={
          <p>
            <Link href={DO_SPEC}>SubscriptionDO</Link> holds the event buffer and significance state.{' '}
            <Link href={DO_SPEC}>AgentSessionDO</Link> runs the wake — with Audit, Inference, and TrainingData sidecars.
            Same mental model on Cloudflare Workers or Kubernetes HPA.
          </p>
        }
      >
        <ul className="grid max-w-4xl gap-8 sm:grid-cols-3">
          <li>
            <h3 className="font-display text-lg font-semibold tracking-tight text-mist-950 dark:text-white">
              Virtual-key budgets
            </h3>
            <Text className="mt-2">
              Keys bind on session create and expire on destroy — every autonomous wake has a hard spend ceiling through{' '}
              <code className="font-mono text-[0.9em]">clawql-inference</code>.
            </Text>
          </li>
          <li>
            <h3 className="font-display text-lg font-semibold tracking-tight text-mist-950 dark:text-white">
              WORM on every action
            </h3>
            <Text className="mt-2">
              Reactive ingest never waits on the model. Forensic reconstruction is a hash chain you own, not a vendor
              console export.
            </Text>
          </li>
          <li>
            <h3 className="font-display text-lg font-semibold tracking-tight text-mist-950 dark:text-white">
              Training emission
            </h3>
            <Text className="mt-2">
              Optional RTP + OpenBenchTrace export with consent scopes — the Intelligence Flywheel without surrendering
              sovereignty.
            </Text>
          </li>
        </ul>
      </Section>

      <Section
        id="compare"
        eyebrow="Positioning"
        headline="The pattern labs built for themselves — as a platform"
        subheadline={
          <p>
            Stripe Minions, Anthropic Managed Agents, and OpenAI Agents SDK all implement event → context → reason →
            tools → audit. ClawQL Streams is that pattern with operator-owned infrastructure.
          </p>
        }
      >
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="streams-compare min-w-[44rem]">
            <thead>
              <tr>
                <th scope="col"> </th>
                <th scope="col">Stripe Minions</th>
                <th scope="col">Managed Agents</th>
                <th scope="col">Agents SDK</th>
                <th scope="col">ClawQL Streams</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.axis}>
                  <th scope="row">{row.axis}</th>
                  <td className="text-mist-700 dark:text-mist-400">{row.stripe}</td>
                  <td className="text-mist-700 dark:text-mist-400">{row.anthropic}</td>
                  <td className="text-mist-700 dark:text-mist-400">{row.openai}</td>
                  <td className="text-mist-900 dark:text-mist-100">{row.clawql}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="specs"
        className="streams-section-band"
        eyebrow="Specifications"
        headline="Draft specs live on docs.clawql.com"
        subheadline={
          <p>
            Streams is shipping as an opt-in coordination layer over packages you already deploy — inference, payments,
            Ouroboros, NATS, and WORM memory.
          </p>
        }
      >
        <ul className="flex max-w-2xl flex-col gap-4 text-base/7 text-mist-800 dark:text-mist-300">
          <li>
            <Link href={STREAMS_SPEC}>ClawQL Streams specification</Link> — event loop, delivery modes, significance
            filters, training emission
          </li>
          <li>
            <Link href={DO_SPEC}>ClawQL Durable Objects</Link> — SubscriptionDO, AgentSessionDO, sidecars, K8s parity
          </li>
          <li>
            <Link href={ADAPTER_DOCS}>mcp-api-adapter</Link> — five (plus WebSocket) surfaces that complete the Protocol
            Fabric
          </li>
        </ul>
      </Section>

      <CallToActionSimpleCentered
        id="cta"
        headline="Put an event loop under your agents"
        subheadline={
          <p>
            Start a trial on the Agentic Gateway today. When Streams lands, the same MCP endpoint, vault, and WORM trail
            become the autonomous runtime — not a second product.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={STREAMS_SPEC} size="lg">
              Read the Streams spec <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </div>
  )
}
