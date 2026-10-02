import { execFile as execFileCallback, spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  applyEnvChangesToVaultProviderData,
  isProvidersVaultPath,
  PROVIDERS_VAULT_KV_PATH,
  vaultProviderDataToEnv,
} from './provider-vault-catalog'

const execFile = promisify(execFileCallback)

export type SecretSyncOptions = {
  namespace: string
  secretName: string
  deploymentName: string
  /** Keys to set or replace (UTF-8 string values, not base64). */
  literals: Record<string, string>
  /** Keys to remove from `data` (e.g. user cleared a field that existed in the Secret). */
  removeKeys?: string[]
}

function vaultMount(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_MOUNT?.trim() || 'secret'
}

function vaultPath(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_PATH?.trim() || PROVIDERS_VAULT_KV_PATH
}

function vaultNamespace(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_NAMESPACE?.trim() || 'clawql'
}

function vaultPod(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_POD?.trim() || 'clawql-hashicorpvault-0'
}

function vaultAddr(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_ADDR?.trim() || 'http://127.0.0.1:8200'
}

function vaultToken(): string {
  return process.env.CLAWQL_DASHBOARD_VAULT_TOKEN?.trim() || process.env.VAULT_TOKEN?.trim() || 'root'
}

function providersMode(): boolean {
  return isProvidersVaultPath(vaultPath())
}

/** RFC 6901 escape for a single path segment after `/data/`. */
function jsonPointerEscape(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function kubectlArgs(rest: string[]): string[] {
  const ctx = process.env.KUBE_CONTEXT?.trim()
  return ctx ? ['--context', ctx, ...rest] : rest
}

const execOpts = {
  encoding: 'utf8' as const,
  env: process.env,
  maxBuffer: 12 * 1024 * 1024,
}

async function execKubectl(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile('kubectl', kubectlArgs(args), execOpts)
}

async function execVaultInPod(vaultArgs: string[]): Promise<{ stdout: string; stderr: string }> {
  return execKubectl([
    'exec',
    '-n',
    vaultNamespace(),
    vaultPod(),
    '--',
    'env',
    `VAULT_ADDR=${vaultAddr()}`,
    `VAULT_TOKEN=${vaultToken()}`,
    'vault',
    ...vaultArgs,
  ])
}

export async function kubectlVersionOk(): Promise<boolean> {
  try {
    await execFile('kubectl', kubectlArgs(['version', '--client=true', '--output=json']), execOpts)
    return true
  } catch {
    return false
  }
}

async function secretExists(namespace: string, secretName: string): Promise<boolean> {
  try {
    await execKubectl(['get', 'secret', secretName, '-n', namespace])
    return true
  } catch {
    return false
  }
}

function encodeData(literals: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(literals)) {
    data[k] = Buffer.from(v, 'utf8').toString('base64')
  }
  return data
}

function kubectlApplyFromStdin(manifest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('kubectl', kubectlArgs(['apply', '-f', '-']), {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdin.write(manifest)
    child.stdin.end()
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `kubectl apply exited ${code ?? 'unknown'}`))
    })
  })
}

async function createSecretFromLiterals(
  namespace: string,
  secretName: string,
  literals: Record<string, string>,
): Promise<void> {
  const args = ['create', 'secret', 'generic', secretName, '-n', namespace]
  for (const [k, v] of Object.entries(literals)) {
    args.push('--from-literal', `${k}=${v}`)
  }
  args.push('--dry-run=client', '-o', 'json')
  const { stdout } = await execKubectl(args)
  await kubectlApplyFromStdin(stdout)
}

async function patchSecretData(
  namespace: string,
  secretName: string,
  literals: Record<string, string>,
): Promise<void> {
  const patch = { data: encodeData(literals) }
  await execKubectl([
    'patch',
    'secret',
    secretName,
    '-n',
    namespace,
    '--type',
    'merge',
    '-p',
    JSON.stringify(patch),
  ])
}

async function readVaultKvRaw(): Promise<Record<string, string> | null> {
  try {
    const { stdout } = await execVaultInPod(['kv', 'get', '-mount', vaultMount(), '-format=json', vaultPath()])
    const doc = JSON.parse(stdout) as {
      data?: { data?: Record<string, string> }
    }
    const data = doc.data?.data ?? {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      out[k] = String(v ?? '')
    }
    return out
  } catch (e: unknown) {
    const stderr =
      typeof e === 'object' && e !== null && 'stderr' in e
        ? String((e as { stderr?: Buffer | string }).stderr ?? '')
        : ''
    const msg = e instanceof Error ? e.message : String(e)
    const combined = `${stderr} ${msg}`
    if (/No value found|NotFound|\(NotFound\)|not found/i.test(combined)) {
      return null
    }
    throw e instanceof Error ? e : new Error(msg)
  }
}

async function readKubernetesSecretData(
  namespace: string,
  secretName: string,
): Promise<Record<string, string> | null> {
  try {
    const { stdout } = await execKubectl([
      'get',
      'secret',
      secretName,
      '-n',
      namespace,
      '-o',
      'json',
    ])
    const doc = JSON.parse(stdout) as { data?: Record<string, string> }
    const data = doc.data ?? {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      out[k] = Buffer.from(v, 'base64').toString('utf8')
    }
    return out
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/NotFound|not found/i.test(msg)) return null
    throw e instanceof Error ? e : new Error(msg)
  }
}

/**
 * Read provider/env values for the dashboard form.
 * Source of truth: Vault KV; falls back to the Kubernetes Secret when Vault is empty.
 */
export async function readSecretData(
  namespace: string,
  secretName: string,
): Promise<Record<string, string> | null> {
  const vaultRaw = await readVaultKvRaw()
  if (providersMode()) {
    if (vaultRaw && Object.keys(vaultRaw).length > 0) {
      return vaultProviderDataToEnv(vaultRaw)
    }
    const secretData = await readKubernetesSecretData(namespace, secretName)
    return secretData && Object.keys(secretData).length > 0 ? secretData : null
  }
  return vaultRaw
}

async function writeVaultData(data: Record<string, string>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'clawql-dashboard-vault-'))
  const localPath = join(dir, 'payload.json')
  const remotePath = '/tmp/clawql-dashboard-vault-payload.json'
  try {
    await writeFile(localPath, JSON.stringify(data), { mode: 0o600 })
    await execKubectl(['cp', localPath, `${vaultNamespace()}/${vaultPod()}:${remotePath}`])
    await execVaultInPod(['kv', 'put', '-mount', vaultMount(), vaultPath(), `@${remotePath}`])
    await execKubectl(['exec', '-n', vaultNamespace(), vaultPod(), '--', 'rm', '-f', remotePath])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function removeSecretDataKeys(
  namespace: string,
  secretName: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return
  const decoded = await readKubernetesSecretData(namespace, secretName)
  if (!decoded) return
  const ops = keys
    .filter((k) => Object.prototype.hasOwnProperty.call(decoded, k))
    .map((k) => ({ op: 'remove' as const, path: `/data/${jsonPointerEscape(k)}` }))
  if (ops.length === 0) return
  await execKubectl([
    'patch',
    'secret',
    secretName,
    '-n',
    namespace,
    '--type',
    'json',
    '-p',
    JSON.stringify(ops),
  ])
}

async function syncKubernetesSecretEnv(
  namespace: string,
  secretName: string,
  envLiterals: Record<string, string>,
  removeKeys: string[],
): Promise<void> {
  const hasLiterals = Object.keys(envLiterals).length > 0
  const hasRemoves = removeKeys.length > 0
  if (!hasLiterals && !hasRemoves) return

  const exists = await secretExists(namespace, secretName)
  if (!exists) {
    if (!hasLiterals) return
    await createSecretFromLiterals(namespace, secretName, envLiterals)
    return
  }
  if (hasLiterals) {
    await patchSecretData(namespace, secretName, envLiterals)
  }
  if (hasRemoves) {
    await removeSecretDataKeys(namespace, secretName, removeKeys)
  }
}

async function rolloutRestartDeployment(
  namespace: string,
  deploymentName: string,
): Promise<void> {
  await execKubectl(['rollout', 'restart', `deployment/${deploymentName}`, '-n', namespace])
}

/**
 * Apply literal updates and/or removals, persist Vault KV, sync the Kubernetes Secret, restart rollout.
 */
export async function syncSecretAndRestart(opts: SecretSyncOptions): Promise<void> {
  const { namespace, secretName, deploymentName, literals } = opts
  const removeKeys = (opts.removeKeys ?? []).filter((k) => k.trim() !== '')
  const hasLiterals = Object.keys(literals).length > 0
  const hasRemoves = removeKeys.length > 0

  if (!hasLiterals && !hasRemoves) {
    throw new Error('No changes to apply')
  }

  if (providersMode()) {
    const currentVault = (await readVaultKvRaw()) ?? {}
    const nextVault = applyEnvChangesToVaultProviderData(currentVault, literals, removeKeys)
    await writeVaultData(nextVault)

    const envLiterals: Record<string, string> = { ...literals }
    await syncKubernetesSecretEnv(namespace, secretName, envLiterals, removeKeys)
    await rolloutRestartDeployment(namespace, deploymentName)
    return
  }

  const current = (await readVaultKvRaw()) ?? {}
  const next: Record<string, string> = { ...current }

  for (const [k, v] of Object.entries(literals)) {
    next[k] = v
  }
  for (const k of removeKeys) {
    delete next[k]
  }

  await writeVaultData(next)
  await syncKubernetesSecretEnv(namespace, secretName, literals, removeKeys)
  await rolloutRestartDeployment(namespace, deploymentName)
}
