/**
 * Walk up from startDir to the ClawQL monorepo root.
 *
 * Important: `apps/docs` is the Next.js docs *site*. A naive
 * `existsSync(…/docs)` stops at `apps/` because that directory contains
 * a folder named `docs`. Require both the markdown tree (`docs/mcp`) and
 * the site (`apps/docs`) so sync scripts read repo sources, not stale mirrors.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {string} startDir
 * @returns {string | null}
 */
export function findMonorepoRoot(startDir) {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, 'docs', 'mcp')) &&
      fs.existsSync(path.join(dir, 'apps', 'docs'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
