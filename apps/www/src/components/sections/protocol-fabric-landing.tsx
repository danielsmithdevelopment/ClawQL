import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { protocolFabricSurfaces } from '@/lib/marketing'
import { site } from '@/lib/site'

import './protocol-fabric-landing.css'

const FABRIC_DOCS = protocolFabricSurfaces.docsHref
const ADAPTER_DOCS = protocolFabricSurfaces.adapterHref
const CUSTOM_SOURCES = `${site.urls.docs}/getting-started/custom-sources`
const STREAMS_PAGE = site.urls.streams
const AGENTS_PAGE = site.urls.agents

const directions = [
  {
    label: 'In',
    title: 'ClawQL Core → MCP',
    detail: protocolFabricSurfaces.inbound,
  },
  {
    label: 'Out',
    title: 'mcp-api-adapter → any surface',
    detail: protocolFabricSurfaces.outbound,
  },
] as const

function FabricField() {
  return (
    <div className="fabric-hero__visual" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
        <path
          className="fabric-thread fabric-thread--c"
          d="M-40 200 C 240 140, 400 280, 640 220 S 1000 90, 1240 170 S 1500 300, 1520 260"
        />
        <path
          className="fabric-thread fabric-thread--a"
          d="M-60 360 C 200 300, 360 440, 580 380 S 920 250, 1140 340 S 1420 480, 1520 420"
        />
        <path
          className="fabric-thread fabric-thread--b"
          d="M-40 540 C 220 490, 380 630, 620 570 S 960 440, 1180 520 S 1440 660, 1520 600"
        />
        <path
          className="fabric-thread fabric-thread--a"
          d="M-80 700 C 180 640, 340 780, 560 720 S 900 590, 1120 670 S 1400 800, 1520 740"
        />
        <circle className="fabric-node" cx="580" cy="380" r="5" />
        <circle className="fabric-node fabric-node--late" cx="1180" cy="520" r="6" />
        <circle className="fabric-node" cx="900" cy="250" r="4" />
        <circle className="fabric-node fabric-node--late" cx="720" cy="570" r="4" />
      </svg>
    </div>
  )
}

export function ProtocolFabricLanding() {
  return (
    <div className="fabric-page">
      <section id="hero" className="fabric-hero" aria-labelledby="fabric-brand">
        <FabricField />
        <div className="fabric-hero__content mx-auto w-full max-w-7xl px-6 sm:px-8">
          <div className="max-w-3xl">
            <h1 id="fabric-brand" className="fabric-brand">
              <span>ClawQL</span>
              Protocol Fabric
            </h1>
            <p className="fabric-hero__headline">Any protocol in. Any protocol out. MCP in the middle.</p>
            <p className="fabric-hero__lede">
              Core turns APIs into MCP tools. mcp-api-adapter turns MCP back into OpenAPI, GraphQL, gRPC, CLI,
              WebSocket, QR, or <code className="font-mono text-[0.9em]">/mcp-ui</code>. One common IR — both
              directions.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={FABRIC_DOCS} size="lg" color="light">
                Read the Fabric docs
              </ButtonLink>
              <PlainButtonLink href={site.urls.signup} size="lg" color="light">
                Start free trial <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="diagram"
        className="fabric-section-band"
        eyebrow="Architecture"
        headline="Seven in. Hub. Seven out."
        subheadline={
          <p>
            API sources on the left — including <strong>WebMCP (preview)</strong> — feed{' '}
            <strong>ClawQL Core + mcp-api-adapter</strong> at the center; transport layers on the right. WORM audit sits
            below; <strong>HTMX / MCP-UI</strong> exposes the catalog to humans on the surface side.
          </p>
        }
      >
        <figure className="fabric-diagram">
          <picture>
            <source type="image/webp" srcSet="/protocol-fabric/clawql-protocol-fabric.webp" />
            <img
              src="/protocol-fabric/clawql-protocol-fabric.png"
              alt="ClawQL Protocol Fabric — API sources including WebMCP into ClawQL Core + mcp-api-adapter, transport layers out including HTMX / MCP-UI, WORM audit log below"
              width={1400}
              height={933}
              loading="eager"
              decoding="async"
            />
          </picture>
          <figcaption>ClawQL Protocol Fabric — anything to MCP to anything</figcaption>
        </figure>
      </Section>

      <Section
        id="directions"
        className="fabric-surface"
        eyebrow="Both directions"
        headline="N×M protocols collapse to N+M"
        subheadline={
          <p>
            Enterprise service buses reduced integrations with a common bus. Protocol Fabric is the agent-era analogue:
            MCP is the message format, full protocol surface on both sides.
          </p>
        }
      >
        <div className="grid gap-10 md:grid-cols-2 md:gap-8">
          {directions.map((dir) => (
            <div key={dir.label} className="fabric-dir">
              <p className="fabric-dir__label">{dir.label}</p>
              <h3 className="fabric-dir__title">{dir.title}</h3>
              <p className="fabric-dir__detail">{dir.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="loop"
        className="fabric-section-band"
        eyebrow="Proven loop"
        headline="WebSocket → CLI → REST → vault — one smoke"
        subheadline={
          <p>
            August 2026: a deterministic path crosses both fabric directions and lands a real vault note. Not an LLM
            benchmark — if any hop fails, the marker never shows up in recall.
          </p>
        }
      >
        <pre className="fabric-loop" tabIndex={0}>
          {`WebSocket event
    → mcp-api-adapter (/ws tools/call)
    → clawql-mcp execute(cli__fabric_event__run)
    → gen-cli subprocess
    → POST /memory_ingest on the adapter (REST)
    → clawql-mcp memory_ingest
    → vault note with marker FABRIC_LOOP_*
    → memory_recall finds the marker`}
        </pre>
        <p className="fabric-dir__detail mt-8 max-w-2xl">
          Run it from the repo: <code className="font-mono text-[0.9em]">scripts/dev/smoke-protocol-fabric-loop.sh</code>
          . Full write-up on the{' '}
          <Link href={FABRIC_DOCS}>Protocol Fabric docs</Link>.
        </p>
      </Section>

      <Section
        id="connect"
        className="fabric-surface"
        eyebrow="Connected products"
        headline="Fabric is the spine — Streams and Agents ride it"
        subheadline={
          <p>
            Same MCP endpoint, same vault, same adapter surfaces. Streams adds the event loop. Agents add significance
            filters, ontology recall, and human review via <code className="font-mono text-[0.9em]">/mcp-ui</code>.
          </p>
        }
      >
        <ul className="fabric-spec-list">
          <li>
            <Link href={FABRIC_DOCS}>Protocol Fabric specification</Link> — architecture, loop topology, competitive
            framing
          </li>
          <li>
            <Link href={ADAPTER_DOCS}>mcp-api-adapter</Link> — wrap any MCP server; expose OpenAPI, GraphQL, gRPC, CLI,
            WebSocket
          </li>
          <li>
            <Link href={CUSTOM_SOURCES}>Custom sources</Link> — CLI / OpenAPI / GraphQL / gRPC ops into Core
          </li>
          <li>
            <Link href={STREAMS_PAGE}>ClawQL Streams</Link> — event-driven autonomous agents on the fabric
          </li>
          <li>
            <Link href={AGENTS_PAGE}>Agentic Platform</Link> — Streams + ontology + TEE-ready audit
          </li>
        </ul>
      </Section>

      <CallToActionSimpleCentered
        id="cta"
        className="fabric-section-band"
        headline="Put MCP between your protocols"
        subheadline={
          <p>
            Self-host free on Apache 2.0, or start a 14-day Developer trial. One MCP endpoint on every tier — same URL
            when you upgrade.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={FABRIC_DOCS} size="lg">
              Read the Fabric docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </div>
  )
}
