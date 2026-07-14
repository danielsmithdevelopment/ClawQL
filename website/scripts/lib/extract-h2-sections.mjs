/**
 * Extract h2 sections (title + slugify id) from MDX — matches rehypeSlugify.
 */
import { slugifyWithCounter } from '@sindresorhus/slugify'
import { toString } from 'mdast-util-to-string'
import { remark } from 'remark'
import remarkMdx from 'remark-mdx'
import { visit } from 'unist-util-visit'

const processor = remark().use(remarkMdx)

/**
 * @param {string} mdx
 * @returns {{ title: string, id: string }[]}
 */
export function extractH2Sections(mdx) {
  const tree = processor.parse(mdx)
  const slugify = slugifyWithCounter()
  /** @type {{ title: string, id: string }[]} */
  const sections = []

  visit(tree, 'heading', (node) => {
    if (node.depth !== 2) return
    const title = toString(node).trim()
    if (!title) return
    sections.push({ title, id: slugify(title) })
  })

  return sections
}

/** Minimum h2 count before we surface an in-page / sidebar TOC. */
export const TOC_MIN_SECTIONS = 2

/** Above this, OnThisPage starts collapsed and sidebar lists a truncated set. */
export const TOC_COMPACT_THRESHOLD = 20
