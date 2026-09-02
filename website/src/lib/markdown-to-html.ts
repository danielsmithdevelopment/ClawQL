/**
 * Markdown → HTML for docs bodies loaded from ASSETS (not compiled into Worker JS).
 * Keeps Cloudflare Worker gzip under the free-plan 3 MiB script limit.
 */
import type { Element, Root } from 'hast'
import rehypeStringify from 'rehype-stringify'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import { visit } from 'unist-util-visit'

function countTableColumns(table: Element): number {
  let cols = 0
  for (const section of table.children) {
    if (section.type !== 'element') continue
    if (section.tagName !== 'thead' && section.tagName !== 'tbody') continue
    for (const row of section.children) {
      if (row.type !== 'element' || row.tagName !== 'tr') continue
      let rowCols = 0
      for (const cell of row.children) {
        if (
          cell.type === 'element' &&
          (cell.tagName === 'th' || cell.tagName === 'td')
        ) {
          rowCols += 1
        }
      }
      cols = Math.max(cols, rowCols)
    }
  }
  return cols
}

/** Match MDX `table()` wrapper so Playwright + mobile table CSS apply. */
function rehypeDocsTable() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index == null) return
      const cols = countTableColumns(node)
      if (cols > 0) {
        node.properties = {
          ...node.properties,
          className: ['docs-table', `docs-table-cols-${cols}`],
          dataCols: cols,
        }
      } else {
        node.properties = { ...node.properties, className: ['docs-table'] }
      }

      const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['docs-table-scroll', 'not-prose'],
          tabIndex: 0,
          role: 'region',
          ariaLabel: 'Scrollable table',
        },
        children: [node],
      }
      parent.children[index] = wrapper
    })
  }
}

/**
 * Prose CSS uses `overflow-x: auto` on `pre`. Axe `scrollable-region-focusable`
 * requires keyboard access — match CodePanel (`tabIndex={0}`) for ASSETS HTML.
 */
function rehypeDocsPre() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'pre') return
      const props = node.properties ?? {}
      if (props.tabIndex != null || props.tabindex != null) return
      node.properties = {
        ...props,
        tabIndex: 0,
      }
    })
  }
}

export type MarkdownToHtmlOptions = {
  /**
   * Heading hierarchy for pages that already expose a page-level `<h1>`,
   * or decks that misuse `#` for every slide.
   * - `all`: every `<h1>` → `<h2>`
   * - `after-first`: keep the first `<h1>`, demote the rest to `<h2>`
   */
  demoteH1?: 'all' | 'after-first'
}

/** Post-stringify demotion keeps unified/rehype plugin typing simple. */
function demoteH1Tags(
  html: string,
  mode: NonNullable<MarkdownToHtmlOptions['demoteH1']>,
): string {
  let seenFirstOpen = false
  let pendingFirstClose = false
  return html.replace(/<\/?h1\b([^>]*)>/gi, (full, attrs: string) => {
    const isClose = full.startsWith('</')
    if (!isClose) {
      if (mode === 'all' || seenFirstOpen) {
        return `<h2${attrs}>`
      }
      seenFirstOpen = true
      pendingFirstClose = true
      return full
    }
    if (pendingFirstClose) {
      pendingFirstClose = false
      return full
    }
    return '</h2>'
  })
}

export async function markdownToHtml(
  markdown: string,
  options: MarkdownToHtmlOptions = {},
): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeDocsTable)
    .use(rehypeDocsPre)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  const html = String(file)
  return options.demoteH1 ? demoteH1Tags(html, options.demoteH1) : html
}
