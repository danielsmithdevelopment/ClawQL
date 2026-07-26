import { slugifyWithCounter } from '@sindresorhus/slugify'
import glob from 'fast-glob'
import * as fs from 'fs'
import { toString } from 'mdast-util-to-string'
import * as path from 'path'
import { remark } from 'remark'
import remarkMdx from 'remark-mdx'
import { filter } from 'unist-util-filter'
import { SKIP, visit } from 'unist-util-visit'

const slugify = slugifyWithCounter()

function isObjectExpression(node) {
  return (
    node.type === 'mdxTextExpression' &&
    node.data?.estree?.body?.[0]?.expression?.type === 'ObjectExpression'
  )
}

function excludeObjectExpressions(tree) {
  return filter(tree, (node) => !isObjectExpression(node))
}

function extractSections() {
  return (tree, { sections }) => {
    slugify.reset()

    visit(tree, (node) => {
      if (node.type === 'heading' || node.type === 'paragraph') {
        const content = toString(excludeObjectExpressions(node))
        if (node.type === 'heading' && node.depth <= 2) {
          const hash = node.depth === 1 ? null : slugify(content)
          sections.push([content, hash, []])
        } else {
          sections.at(-1)?.[2].push(content)
        }
        return SKIP
      }
    })
  }
}

const processor = remark().use(remarkMdx).use(extractSections)

/**
 * @param {string} mdx
 * @param {Map<string, [string, unknown[]]>} cache
 * @param {string} cacheKey
 */
function sectionsForMdx(mdx, cache, cacheKey) {
  if (cache.get(cacheKey)?.[0] === mdx) {
    return cache.get(cacheKey)[1]
  }
  const sections = []
  const vfile = { value: mdx, sections }
  processor.runSync(processor.parse(vfile), vfile)
  cache.set(cacheKey, [mdx, sections])
  return sections
}

import { GENERATED_BODY_ROUTES } from './generated-doc-routes.mjs'

/**
 * @param {{ appDir: string, trainingDir?: string, generatedDir?: string, pluginsBodiesDir?: string }} opts
 * @returns {Array<{ url: string, sections: unknown[] }>}
 */
export function collectSearchIndexPages({
  appDir,
  trainingDir,
  generatedDir,
  pluginsBodiesDir,
}) {
  const cache = new Map()
  const data = []

  const files = glob.sync('**/*.mdx', { cwd: appDir })
  for (const file of files) {
    const url = '/' + file.replace(/(^|\/)page\.mdx$/, '')
    const mdx = fs.readFileSync(path.join(appDir, file), 'utf8')
    data.push({ url, sections: sectionsForMdx(mdx, cache, file) })
  }

  if (generatedDir && fs.existsSync(generatedDir)) {
    for (const [fileName, url] of Object.entries(GENERATED_BODY_ROUTES)) {
      const filePath = path.join(generatedDir, fileName)
      if (!fs.existsSync(filePath)) continue
      const mdx = fs.readFileSync(filePath, 'utf8')
      data.push({
        url,
        sections: sectionsForMdx(mdx, cache, `generated:${fileName}`),
      })
    }
  }

  if (pluginsBodiesDir && fs.existsSync(pluginsBodiesDir)) {
    const pluginFiles = glob.sync('*.mdx', { cwd: pluginsBodiesDir })
    for (const fileName of pluginFiles) {
      const slug = fileName.replace(/\.mdx$/, '')
      const mdx = fs.readFileSync(path.join(pluginsBodiesDir, fileName), 'utf8')
      data.push({
        url: `/plugins/${slug}`,
        sections: sectionsForMdx(mdx, cache, `plugin:${fileName}`),
      })
    }
  }

  if (trainingDir && fs.existsSync(trainingDir)) {
    const trainingFiles = glob.sync('*.mdx', { cwd: trainingDir })
    for (const tf of trainingFiles) {
      const slug = tf.replace(/\.mdx$/, '')
      const cacheKey = `training:${tf}`
      const mdx = fs.readFileSync(path.join(trainingDir, tf), 'utf8')
      data.push({
        url: `/security/best-practices/${slug}`,
        sections: sectionsForMdx(mdx, cache, cacheKey),
      })
    }
  }

  return data
}

/** @param {string} url */
export function chunkIdForUrl(url) {
  // Strip hash/query so /plugins#registry groups with /plugins (and never
  // emits filenames containing `#`, which break fetch as URL fragments).
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment ?? 'root'
}

/**
 * @param {Array<{ url: string, sections: unknown[] }>} pages
 */
export function groupPagesByChunk(pages) {
  /** @type {Map<string, Array<{ url: string, sections: unknown[] }>>} */
  const chunks = new Map()
  for (const page of pages) {
    const id = chunkIdForUrl(page.url)
    if (!chunks.has(id)) chunks.set(id, [])
    chunks.get(id).push(page)
  }
  return chunks
}
