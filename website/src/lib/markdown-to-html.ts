/**
 * Markdown → HTML for docs bodies loaded from ASSETS (not compiled into Worker JS).
 * Keeps Cloudflare Worker gzip under the free-plan 3 MiB script limit.
 */
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(file)
}
