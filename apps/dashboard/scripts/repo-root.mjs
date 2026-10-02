import fs from 'node:fs'
import path from 'node:path'

/**
 * Walk up from `startDir` to the monorepo root.
 * Local: skip `apps/dashboard` (it may have a copied `.env.example`; package name is `clawql-dashboard`).
 * Docker: `.env.example` is copied to `/app` (WORKDIR `/app/dashboard`).
 */
export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 12; i++) {
    const envExample = path.join(dir, '.env.example')
    if (fs.existsSync(envExample)) {
      const pkgPath = path.join(dir, 'package.json')
      if (!fs.existsSync(pkgPath)) {
        return dir
      }
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg.name === 'clawql-mcp') {
          return dir
        }
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`Could not find ClawQL repo root from ${startDir}`)
}

