import clsx from 'clsx'
import Link from 'next/link'
import { Children, isValidElement } from 'react'

import { Pre as CodePre } from '@/components/Code'
import { FeedbackClientIsland } from '@/components/FeedbackClientIsland'
import { Heading } from '@/components/Heading'
import { MermaidDiagramLazy } from '@/components/MermaidDiagramLazy'
import { Prose } from '@/components/Prose'

export const a = Link
export { Button } from '@/components/Button'
export { Code as code, CodeGroup } from '@/components/Code'

/**
 * Markdown `![]()` images: default lazy + async decode to reduce Worker CPU and
 * speed first paint on long case-study pages. Prefer explicit alt text in MDX.
 */
export function img({
  className,
  alt,
  loading,
  decoding,
  ...props
}: React.ComponentPropsWithoutRef<'img'>) {
  return (
    <img
      alt={alt ?? ''}
      loading={loading ?? 'lazy'}
      decoding={decoding ?? 'async'}
      className={clsx(
        'h-auto max-w-full rounded-lg ring-1 ring-zinc-900/10 dark:ring-white/10',
        className,
      )}
      {...props}
    />
  )
}

/** Extract plain text from a fenced-code `pre` child (Shiki HTML or raw string). */
function readPreCodeText(children: React.ReactNode): string {
  let text = ''
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      if (typeof child === 'string') text += child
      return
    }
    if (child.type === 'code') {
      const props = child.props as {
        children?: React.ReactNode
        dangerouslySetInnerHTML?: { __html: string }
      }
      if (typeof props.children === 'string') {
        text += props.children
      } else if (props.dangerouslySetInnerHTML?.__html) {
        text += props.dangerouslySetInnerHTML.__html.replace(/<[^>]+>/g, '')
      }
    }
  })
  return text.trim()
}

type PreProps = React.ComponentPropsWithoutRef<'pre'> & {
  'data-language'?: string
  language?: string
}

/** Route Mermaid fences to a diagram; other languages use the default code block UI. */
export function pre(props: PreProps) {
  const language = props['data-language'] ?? props.language
  if (language === 'mermaid') {
    return <MermaidDiagramLazy chart={readPreCodeText(props.children)} />
  }
  return (
    <CodePre {...(props as React.ComponentPropsWithoutRef<typeof CodePre>)} />
  )
}

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <Prose className="flex-auto">{children}</Prose>
      <footer className="mx-auto mt-16 w-full max-w-2xl lg:max-w-5xl">
        <FeedbackClientIsland />
      </footer>
    </article>
  )
}

export const h2 = function H2(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, 'level'>,
) {
  return <Heading level={2} {...props} />
}

function InfoIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="8" strokeWidth="0" />
      <path
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6.75 7.75h1.5v3.5"
      />
      <circle cx="8" cy="4" r=".5" fill="none" />
    </svg>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="my-6 flex gap-2.5 rounded-2xl border border-claw-cyan/25 bg-claw-cyan/5 p-4 text-sm/6 text-[#134e4a] dark:border-claw-cyan/30 dark:bg-claw-cyan/5 dark:text-zinc-200 dark:[--tw-prose-links-hover:var(--color-claw-cyan-bright)] dark:[--tw-prose-links:var(--color-white)]"
    >
      <InfoIcon className="mt-1 h-4 w-4 flex-none fill-[#0e7490] stroke-white dark:fill-claw-cyan/20 dark:stroke-claw-cyan" />
      <div className="*:first:mt-0 *:last:mb-0">{children}</div>
    </div>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-16 gap-y-10 xl:max-w-none xl:grid-cols-2">
      {children}
    </div>
  )
}

export function Col({
  children,
  sticky = false,
}: {
  children: React.ReactNode
  sticky?: boolean
}) {
  return (
    <div
      className={clsx(
        '*:first:mt-0 *:last:mb-0',
        sticky && 'xl:sticky xl:top-24',
      )}
    >
      {children}
    </div>
  )
}

type TableRowProps = { children?: React.ReactNode }
type TableSectionProps = { children?: React.ReactNode }

/** Count columns from the first header/data row for responsive table layout. */
function countTableColumns(children: React.ReactNode): number {
  let cols = 0
  Children.forEach(children, (section) => {
    if (!isValidElement<TableSectionProps>(section)) return
    Children.forEach(section.props.children, (row) => {
      if (!isValidElement<TableRowProps>(row) || row.type !== 'tr') return
      let rowCols = 0
      Children.forEach(row.props.children, (cell) => {
        if (
          isValidElement(cell) &&
          (cell.type === 'th' || cell.type === 'td')
        ) {
          rowCols += 1
        }
      })
      cols = Math.max(cols, rowCols)
    })
  })
  return cols
}

/** Scrollable table wrapper — keeps column alignment on narrow viewports. */
export function table({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'table'>) {
  const cols = countTableColumns(children)
  return (
    <div
      className="docs-table-scroll not-prose"
      tabIndex={0}
      role="region"
      aria-label="Scrollable table"
    >
      <table
        className={clsx(
          'docs-table',
          cols ? `docs-table-cols-${cols}` : null,
          className,
        )}
        data-cols={cols > 0 ? cols : undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  )
}

export function Properties({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6">
      <ul
        role="list"
        className="m-0 max-w-[calc(var(--container-lg)-(--spacing(8)))] list-none divide-y divide-zinc-900/5 p-0 dark:divide-white/5"
      >
        {children}
      </ul>
    </div>
  )
}

export function Property({
  name,
  children,
  type,
}: {
  name: string
  children: React.ReactNode
  type?: string
}) {
  return (
    <li className="m-0 px-0 py-4 first:pt-0 last:pb-0">
      <dl className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <dt className="sr-only">Name</dt>
        <dd>
          <code>{name}</code>
        </dd>
        {type && (
          <>
            <dt className="sr-only">Type</dt>
            <dd className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {type}
            </dd>
          </>
        )}
        <dt className="sr-only">Description</dt>
        <dd className="w-full flex-none *:first:mt-0 *:last:mb-0">
          {children}
        </dd>
      </dl>
    </li>
  )
}
