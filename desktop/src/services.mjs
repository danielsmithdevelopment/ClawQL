import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'

import {
  BRIDGE_PORT,
  DASHBOARD_PORT,
  desktopServiceEnv,
  ensureClawqlHome,
  waitForHttp,
} from './paths.mjs'

/** @type {ChildProcess[]} */
const children = []

export function stopChildProcesses() {
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  children.length = 0
}

function track(child) {
  children.push(child)
  child.on('exit', () => {
    const idx = children.indexOf(child)
    if (idx >= 0) children.splice(idx, 1)
  })
  return child
}

function spawnLogged(label, command, args, options) {
  const child = track(
    spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
  child.stdout?.on('data', (buf) => {
    process.stderr.write(`[${label}] ${buf}`)
  })
  child.stderr?.on('data', (buf) => {
    process.stderr.write(`[${label}] ${buf}`)
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[${label}] exited code=${code} signal=${signal ?? ''}\n`)
    }
  })
  return child
}

export function resolvePackagedDashboardDir() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'dashboard')
  }
  return join(app.getAppPath(), 'standalone', 'dashboard')
}

export function resolveDevDashboardDir(repoRoot) {
  return join(repoRoot, 'dashboard')
}

export async function startDesktopServices({ devMode, repoRoot }) {
  const home = await ensureClawqlHome()
  const env = desktopServiceEnv(home)

  if (devMode) {
    const dashboardDir = resolveDevDashboardDir(repoRoot)
    spawnLogged('openclaw-bridge', 'node', ['scripts/openclaw-chat-bridge.mjs'], {
      cwd: dashboardDir,
      env,
    })
    spawnLogged('dashboard', 'npm', ['run', 'dev'], {
      cwd: dashboardDir,
      env: { ...env, NODE_ENV: 'development' },
      shell: process.platform === 'win32',
    })
  } else {
    const dashboardDir = resolvePackagedDashboardDir()
    spawnLogged('openclaw-bridge', 'node', ['scripts/openclaw-chat-bridge.mjs'], {
      cwd: dashboardDir,
      env,
    })
    spawnLogged('dashboard', 'node', ['server.js'], {
      cwd: dashboardDir,
      env,
    })
  }

  await waitForHttp(`http://127.0.0.1:${DASHBOARD_PORT}/api/runtime/dashboard`)
  return { home, url: `http://127.0.0.1:${DASHBOARD_PORT}` }
}

export { BRIDGE_PORT, DASHBOARD_PORT }
