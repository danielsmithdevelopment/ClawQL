'use client'

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  type MotionValue,
} from 'framer-motion'
import Link from 'next/link'

import { GridPattern } from '@/components/GridPattern'
import { Heading } from '@/components/Heading'
import { BoltIcon } from '@/components/icons/BoltIcon'
import { BookIcon } from '@/components/icons/BookIcon'
import { CogIcon } from '@/components/icons/CogIcon'
import { ListIcon } from '@/components/icons/ListIcon'
import { MapPinIcon } from '@/components/icons/MapPinIcon'
import { PackageIcon } from '@/components/icons/PackageIcon'
import { ShapesIcon } from '@/components/icons/ShapesIcon'

interface Resource {
  href: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  pattern: Omit<
    React.ComponentPropsWithoutRef<typeof GridPattern>,
    'width' | 'height' | 'x'
  >
}

const resources: Array<Resource> = [
  {
    href: '/tools',
    name: 'Tools',
    description:
      'Core search and execute; sandbox_exec, memory tools, ingest_external_knowledge (bulk Markdown + optional URL fetch); optional in-process cache (CLAWQL_ENABLE_CACHE) and optional audit ring buffer (CLAWQL_ENABLE_AUDIT).',
    icon: BoltIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 1],
        [1, 3],
      ],
    },
  },
  {
    href: '/graphql-proxy',
    name: 'GraphQL proxy',
    description:
      'How in-process GraphQL keeps execute responses lean (single-spec) vs REST (multi-spec).',
    icon: CogIcon,
    pattern: {
      y: -6,
      squares: [
        [-1, 2],
        [1, 3],
      ],
    },
  },
  {
    href: '/kubernetes',
    name: 'gRPC and Kubernetes',
    description:
      'Optional protobuf MCP over gRPC (port 50051), Streamable HTTP on /mcp, ENABLE_GRPC, Docker Desktop and remote clusters.',
    icon: MapPinIcon,
    pattern: {
      y: 12,
      squares: [
        [0, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/bundled-specs',
    name: 'Bundled specs',
    description:
      'Provider presets shipped in the package and how CLAWQL_PROVIDER selects them.',
    icon: PackageIcon,
    pattern: {
      y: 32,
      squares: [
        [0, 2],
        [1, 4],
      ],
    },
  },
  {
    href: '/concepts',
    name: 'Concepts',
    description:
      'Architecture, design principles, and how planning vs execution affect context size.',
    icon: ShapesIcon,
    pattern: {
      y: 22,
      squares: [[0, 1]],
    },
  },
  {
    href: '/benchmarks',
    name: 'Benchmarks',
    description:
      'What the benchmark numbers mean and where to find reproducible artifacts in the repo.',
    icon: ListIcon,
    pattern: {
      y: 8,
      squares: [
        [1, 2],
        [2, 0],
      ],
    },
  },
  {
    href: '/case-studies/cloudflare-docs-mcp',
    name: 'Case study: Cloudflare docs',
    description:
      'End-to-end MCP workflow: search, execute, memory_recall, memory_ingest — deploying docs.clawql.com and fixing Worker runtime issues.',
    icon: BookIcon,
    pattern: {
      y: 18,
      squares: [
        [0, 0],
        [1, 2],
      ],
    },
  },
  {
    href: '/case-studies/vault-memory-github-session-2026-04',
    name: 'Case study: Vault + GitHub session',
    description:
      'memory_ingest at scale, issue triage and new tracking issues, prioritization, and shipping the enterprise audit tool with full docs and Helm wiring.',
    icon: BookIcon,
    pattern: {
      y: 12,
      squares: [
        [2, 1],
        [0, 2],
      ],
    },
  },
  {
    href: '/case-studies/cross-thread-vault-recall',
    name: 'Case study: Cross-thread vault recall',
    description:
      'Before and after: repo-only search vs memory_recall — Obsidian graph, Cuckoo/hybrid memory roadmaps, wikilinks, and session resume workflows.',
    icon: BookIcon,
    pattern: {
      y: 6,
      squares: [
        [1, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/case-studies/truenas-scale-corgicave-homelab',
    name: 'Case study: TrueNAS corgicave homelab',
    description:
      'TrueNAS SCALE on a switch island: Mac errno 49, Docker/K8s utun, memory_ingest/recall, Thunderbolt vs SSH — full triage ladder and resolution.',
    icon: BookIcon,
    pattern: {
      y: 0,
      squares: [
        [0, 1],
        [1, 1],
      ],
    },
  },
  {
    href: '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
    name: 'Case study: Worker 1102 + MCP + memory',
    description:
      'docs.clawql.com incident: Error 1102 and waitUntil warnings; search/execute on Cloudflare APIs; memory_ingest postmortem; Lighthouse CI and prevention runbook.',
    icon: BookIcon,
    pattern: {
      y: 24,
      squares: [
        [0, 0],
        [2, 1],
      ],
    },
  },
]

function ResourceIcon({ icon: Icon }: { icon: Resource['icon'] }) {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/5 ring-1 ring-zinc-900/25 backdrop-blur-[2px] transition duration-300 group-hover:bg-white/50 group-hover:ring-zinc-900/25 dark:bg-white/7.5 dark:ring-white/15 dark:group-hover:bg-claw-cyan/10 dark:group-hover:ring-claw-cyan/40">
      <Icon className="h-5 w-5 fill-zinc-700/10 stroke-zinc-700 transition-colors duration-300 group-hover:stroke-zinc-900 dark:fill-white/10 dark:stroke-zinc-400 dark:group-hover:fill-claw-cyan/15 dark:group-hover:stroke-claw-cyan" />
    </div>
  )
}

function ResourcePattern({
  mouseX,
  mouseY,
  ...gridProps
}: Resource['pattern'] & {
  mouseX: MotionValue<number>
  mouseY: MotionValue<number>
}) {
  let maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`
  let style = { maskImage, WebkitMaskImage: maskImage }

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-2xl mask-[linear-gradient(white,transparent)] transition duration-300 group-hover:opacity-50">
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/2 stroke-black/5 dark:fill-white/1 dark:stroke-white/2.5"
          {...gridProps}
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-2xl bg-linear-to-r from-[#D7EDEA] to-[#F4FBDF] opacity-0 transition duration-300 group-hover:opacity-100 dark:from-[#202D2E] dark:to-[#303428]"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 mix-blend-overlay transition duration-300 group-hover:opacity-100"
        style={style}
      >
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/50 stroke-black/70 dark:fill-white/2.5 dark:stroke-white/10"
          {...gridProps}
        />
      </motion.div>
    </div>
  )
}

function Resource({ resource }: { resource: Resource }) {
  let mouseX = useMotionValue(0)
  let mouseY = useMotionValue(0)

  function onMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    let { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  return (
    <div
      key={resource.href}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-zinc-50 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <ResourcePattern {...resource.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-zinc-900/7.5 ring-inset group-hover:ring-zinc-900/10 dark:ring-white/10 dark:group-hover:ring-white/20" />
      <div className="relative rounded-2xl px-4 pt-16 pb-4">
        <ResourceIcon icon={resource.icon} />
        <h3 className="mt-4 text-sm/7 font-semibold text-zinc-900 dark:text-white">
          <Link href={resource.href}>
            <span className="absolute inset-0 rounded-2xl" />
            {resource.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {resource.description}
        </p>
      </div>
    </div>
  )
}

export function Resources() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="reference">
        Reference
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/5">
        {resources.map((resource) => (
          <Resource key={resource.href} resource={resource} />
        ))}
      </div>
    </div>
  )
}
