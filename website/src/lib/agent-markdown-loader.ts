import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type AgentMarkdownMap = Record<string, string>

const ASSET_PATH = '/agent-markdown.json'

let cachedMap: AgentMarkdownMap | null = null

/**
 * Load agent-negotiation markdown map from Worker static assets (production)
 * or public/ on disk (local dev). Kept out of the Worker JS bundle to stay
 * under Cloudflare's compressed size limit.
 */
export async function loadAgentMarkdownMap(): Promise<AgentMarkdownMap> {
  if (cachedMap) return cachedMap

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = getCloudflareContext()
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(`https://assets.local${ASSET_PATH}`)
      if (res.ok) {
        cachedMap = (await res.json()) as AgentMarkdownMap
        return cachedMap
      }
    }
  } catch {
    // Local Next dev / Node preview — fall through to filesystem read.
  }

  const filePath = path.join(process.cwd(), 'public/agent-markdown.json')
  const raw = await readFile(filePath, 'utf8')
  cachedMap = JSON.parse(raw) as AgentMarkdownMap
  return cachedMap
}
