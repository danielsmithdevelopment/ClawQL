#!/usr/bin/env node
/**
 * Build dashboard Next.js standalone bundle for ClawQL Desktop (Electron extraResources).
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..')
const dashboardRoot = join(repoRoot, 'dashboard')
const outRoot = join(desktopRoot, 'standalone', 'dashboard')

function run(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    })
  })
}

async function main() {
  console.log('[clawql-desktop] building dashboard standalone…')
  await run('npm', ['ci'], dashboardRoot)
  await run('npm', ['run', 'build'], dashboardRoot)

  const standaloneSrc = join(dashboardRoot, '.next', 'standalone', 'dashboard')
  const staticSrc = join(dashboardRoot, '.next', 'static')

  await rm(join(desktopRoot, 'standalone'), { recursive: true, force: true })
  await mkdir(outRoot, { recursive: true })
  await cp(standaloneSrc, outRoot, { recursive: true })
  await mkdir(join(outRoot, '.next', 'static'), { recursive: true })
  await cp(staticSrc, join(outRoot, '.next', 'static'), { recursive: true })

  const scriptsOut = join(outRoot, 'scripts')
  await mkdir(scriptsOut, { recursive: true })
  for (const name of [
    'openclaw-chat-bridge.mjs',
    'openclaw-chat-enrich.mjs',
    'openclaw-reply-from-json.mjs',
  ]) {
    await cp(join(dashboardRoot, 'scripts', name), join(scriptsOut, name))
  }
  await cp(
    join(dashboardRoot, 'scripts', 'fixtures'),
    join(scriptsOut, 'fixtures'),
    { recursive: true },
  )

  console.log('[clawql-desktop] standalone ready at', outRoot)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
