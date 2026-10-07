/**
 * Multi-gateway Compose arrange for RES-01 / RES-06.
 * When Docker is available, kills a replica via kill-replica.sh, then witnesses
 * continuity via POST /gateway/restart. Without Docker, restart-only (compose metadata).
 */
import path from 'node:path'

import { gatewayRestart } from './harness'

const COMPOSE_DIR = path.join(process.cwd(), 'e2e-cloud/compose/multi-gateway')
const KILL_SCRIPT = path.join(COMPOSE_DIR, 'kill-replica.sh')

export type ComposeKillResult = {
  source: 'compose-kill' | 'restart-only'
  killed: boolean
  docker: boolean
  replica: 'gateway-a' | 'gateway-b'
  restart: { status: number; body: Record<string, unknown> }
  detail?: string
}

async function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: opts?.cwd,
      timeout: 30_000,
      encoding: 'utf8',
    })
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
  }
}

async function dockerAvailable(): Promise<boolean> {
  const r = await runCmd('docker', ['compose', 'version'])
  return r.ok
}

/** Kill Compose replica when Docker is up; always POST /gateway/restart for Pass-when. */
export async function arrangeComposeKillReplica(
  replica: 'gateway-a' | 'gateway-b' = 'gateway-a',
): Promise<ComposeKillResult> {
  const hasDocker = await dockerAvailable()
  let killed = false
  let detail = 'Docker unavailable — restart-only arrange'

  if (hasDocker) {
    const kill = await runCmd('bash', [KILL_SCRIPT, replica], { cwd: COMPOSE_DIR })
    killed = kill.ok
    detail = killed
      ? `Killed ${replica} via Compose; witnessing via /gateway/restart`
      : `Compose kill failed (${kill.stderr || kill.stdout}); restart-only`
  }

  const restart = await gatewayRestart({ replica, compose: true })
  return {
    source: killed ? 'compose-kill' : 'restart-only',
    killed,
    docker: hasDocker,
    replica,
    restart,
    detail,
  }
}
