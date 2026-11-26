#!/usr/bin/env node
/**
 * Start the Next standalone server (Next 16+ rejects `next start` when
 * output: 'standalone'). Mirrors apps/docs Dockerfile + website-lighthouse.yml.
 *
 * Env: PORT (default 4173), HOSTNAME (default 127.0.0.1)
 * Cwd: apps/docs (expects .next/standalone from a prior `next build`).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const standalone = join(root, '.next', 'standalone')
const serverJs = join(standalone, 'server.js')

if (!existsSync(serverJs)) {
  console.error(
    'start-standalone: missing .next/standalone/server.js — run `npm run build` first',
  )
  process.exit(1)
}

cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true })
mkdirSync(join(standalone, '.next'), { recursive: true })
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), {
  recursive: true,
})

const port = process.env.PORT || '4173'
const hostname = process.env.HOSTNAME || '127.0.0.1'
const child = spawn(process.execPath, [serverJs], {
  cwd: standalone,
  env: { ...process.env, PORT: port, HOSTNAME: hostname },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
