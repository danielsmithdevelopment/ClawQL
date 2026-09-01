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

export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeDocsTable)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(file)
}
