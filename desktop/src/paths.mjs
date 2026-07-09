import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const DASHBOARD_PORT = 3040
export const BRIDGE_PORT = 8787

export function repoRootFromMain(mainUrl) {
  return resolve(fileURLToPath(new URL('../../..', mainUrl)))
}

export function desktopRootFromMain(mainUrl) {
  return resolve(fileURLToPath(new URL('..', mainUrl)))
}

export function clawqlHome() {
  return process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() || join(homedir(), '.ClawQL')
}

export async function ensureClawqlHome() {
  const home = clawqlHome()
  for (const sub of ['Memory', 'Dashboard/chats', 'Dashboard/logs', 'vault']) {
    await mkdir(join(home, sub), { recursive: true })
  }
  return home
}

export function desktopServiceEnv(home) {
  return {
    ...process.env,
    CLAWQL_DESKTOP_MODE: '1',
    NEXT_PUBLIC_CLAWQL_DESKTOP_MODE: '1',
    CLAWQL_DASHBOARD_ALLOW_K8S_SYNC: '0',
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
    CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL: `http://127.0.0.1:${BRIDGE_PORT}/v1/chat`,
    CLAWQL_DASHBOARD_CHAT_STREAM: process.env.CLAWQL_DASHBOARD_CHAT_STREAM ?? '1',
    OPENCLAW_CHAT_BRIDGE_PORT: String(BRIDGE_PORT),
    PORT: String(DASHBOARD_PORT),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
  }
}

export function waitForHttp(url, timeoutMs = 120_000) {
  const started = Date.now()
  return new Promise((resolvePromise, reject) => {
    const tick = () => {
      fetch(url)
        .then((res) => {
          if (res.ok || res.status < 500) resolvePromise()
          else if (Date.now() - started > timeoutMs) reject(new Error(`Timeout waiting for ${url}`))
          else setTimeout(tick, 400)
        })
        .catch(() => {
          if (Date.now() - started > timeoutMs) reject(new Error(`Timeout waiting for ${url}`))
          else setTimeout(tick, 400)
        })
    }
    tick()
  })
}
