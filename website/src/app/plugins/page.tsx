import { Suspense } from 'react'

import { Button } from '@/components/Button'
import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { PluginRegistryExplorer } from '@/components/PluginRegistryExplorer'
import { Tag } from '@/components/Tag'
import ClawQLPluginModelBody from '@/generated/clawql-plugin-model-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugins',
  description:
    'ClawQL plugin home: searchable sortable registry of horizontal building blocks and domain vertical presets, plus plugin model and vertical composition guidance.',
  path: '/plugins',
})

export const dynamic = 'force-static'

export default function PluginsHubPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Plugins
        </Tag>
        <Tag color="amber" variant="medium">
          Verticals = presets
        </Tag>
        <Tag color="zinc" variant="medium">
          July 2026
        </Tag>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Plugins
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        The home for ClawQL extensions. Horizontal plugins are reusable
        capabilities. Domain verticals are{' '}
        <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
          presets
        </strong>{' '}
        that compose those capabilities (almost always Memory, usually
        Documents) and ship domain-tailored{' '}
        <code className="font-mono text-[0.9em]">.cqw</code> boilerplate ready
        to run or modify.
      </p>

      <div className="not-prose mt-6 mb-8 flex flex-wrap gap-3">
        <Button href="#registry" arrow="right">
          <>Browse registry</>
        </Button>
        <Button href="#verticals" variant="outline">
          <>Domain verticals</>
        </Button>
        <Button href="#plugin-model" variant="outline">
          <>Plugin model</>
        </Button>
      </div>

      <h2
        id="how-to-read"
        className="scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        How to read this catalog
      </h2>
      <div className="mt-4 space-y-3 text-zinc-600 dark:text-zinc-400">
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            Horizontal
          </strong>{' '}
          — shared building blocks (Memory, Documents, Automation, …). Use alone
          or let a vertical pull them in.
        </p>
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            Domain vertical
          </strong>{' '}
          — industry presets on the same{' '}
          <code className="font-mono text-[0.9em]">Plugin.onRegister</code>{' '}
          model. Each row lists what it <em>composes</em> and the domain{' '}
          <em>boilerplate</em> it ships — not a fork of Memory or Documents.
        </p>
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            MCP proxy / providers / core
          </strong>{' '}
          — policy chokepoints, spec merge stacks, and always-on gateway tools.
        </p>
      </div>

      <div className="not-prose mt-8 mb-10">
        <Note>
          Example: <strong>Lending</strong> composes <strong>Memory</strong> +{' '}
          <strong>Documents</strong> (+ Automation), then differentiates with
          LOS <code>.cqw</code> workflows. Filter the table by{' '}
          <em>Domain verticals</em> or share a URL with{' '}
          <code>?kind=vertical</code>.
        </Note>
      </div>

      <h2
        id="registry"
        className="scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        Plugin registry
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Searchable, sortable table with kind/status filters and pagination —
        built for dozens today and hundreds as the catalog grows. Click a name
        for dedicated docs when available.
      </p>

      <div className="mt-6">
        <Suspense
          fallback={
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Loading registry…
            </p>
          }
        >
          <PluginRegistryExplorer />
        </Suspense>
      </div>

      <h2
        id="verticals"
        className="mt-16 scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        Domain verticals
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Verticals are plugin presets for an industry — not a separate product
        line. Enabling lending or legal composes the horizontal plugins that
        domain needs and ships tailored workflow starters.
      </p>

      <div className="not-prose mt-6 overflow-x-auto rounded-xl ring-1 ring-zinc-900/10 dark:ring-white/10">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-white/[0.04]">
            <tr className="border-b border-zinc-900/10 dark:border-white/10">
              <th className="px-3 py-2.5 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
                Layer
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
                What it is
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
                Example
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-600 dark:text-zinc-400">
            <tr className="border-b border-zinc-900/5 dark:border-white/5">
              <td className="px-3 py-3 font-medium text-zinc-900 dark:text-white">
                Horizontal plugins
              </td>
              <td className="px-3 py-3">Reusable capabilities</td>
              <td className="px-3 py-3">Memory, Documents, Automation</td>
            </tr>
            <tr className="border-b border-zinc-900/5 dark:border-white/5">
              <td className="px-3 py-3 font-medium text-zinc-900 dark:text-white">
                Domain vertical
              </td>
              <td className="px-3 py-3">
                Preset that composes horizontals + domain surface
              </td>
              <td className="px-3 py-3">
                Lending → Memory + Documents + LOS <code>.cqw</code>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-3 font-medium text-zinc-900 dark:text-white">
                Boilerplate
              </td>
              <td className="px-3 py-3">Differentiated per vertical</td>
              <td className="px-3 py-3">
                Underwriting vs privilege-review vs claims starters
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="mt-6 list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
        <li>
          Verticals{' '}
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            never import other verticals
          </strong>{' '}
          — cross-domain work goes through{' '}
          <code className="font-mono text-[0.9em]">clawql-api.execute()</code>
        </li>
        <li>
          Disabled verticals have{' '}
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            zero runtime footprint
          </strong>
        </li>
        <li>
          Domain <code className="font-mono text-[0.9em]">.cqw</code> (and
          related <code className="font-mono text-[0.9em]">.cq*</code>) starters
          should be tailored to that vertical — not generic copies
        </li>
        <li>
          No vertical packages are shipped yet — filter the registry by{' '}
          <em>Domain verticals</em> to compare planned presets
        </li>
      </ul>

      <div className="not-prose mt-6 flex flex-wrap gap-3">
        <Button href="/plugins?kind=vertical#registry" arrow="right">
          <>Filter registry: verticals</>
        </Button>
        <Button href="/specs/cq-extensions/cqw" variant="outline">
          <>.cqw workflows</>
        </Button>
        <Button href="/contributing/technical-specification" variant="outline">
          <>Contributor spec</>
        </Button>
      </div>

      <h2
        id="plugin-model"
        className="mt-16 scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        Plugin model
      </h2>
      <p className="mt-2 mb-6 text-zinc-600 dark:text-zinc-400">
        Concepts and target architecture for becoming a plugin — including how
        horizontal packages and domain verticals register MCP tools.
      </p>

      <div className="not-prose mb-8">
        <Note>
          Synced from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/clawql-plugin-model.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/design/clawql-plugin-model.md
          </a>{' '}
          and the living table source{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/reference/clawql-plugin-registry.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/reference/clawql-plugin-registry.md
          </a>
          . The interactive registry above is the site catalog; those files
          remain the repo ground truth for contributors.
        </Note>
      </div>

      <DocProse className="flex-auto">
        <ClawQLPluginModelBody />
      </DocProse>
    </article>
  )
}
