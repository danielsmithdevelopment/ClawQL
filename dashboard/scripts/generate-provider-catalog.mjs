#!/usr/bin/env node
/**
 * Emit provider Vault catalog for the dashboard from scripts/kubernetes/provider-vault-key-catalog.ts
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const outDir = path.join(__dirname, '../src/generated')
const outPath = path.join(outDir, 'provider-vault-catalog.json')

const json = execSync(
  `npx tsx -e "import { PROVIDER_VAULT_KEY_CATALOG, PROVIDERS_VAULT_KV_PATH } from './scripts/kubernetes/provider-vault-key-catalog.ts'; console.log(JSON.stringify({ path: PROVIDERS_VAULT_KV_PATH, entries: PROVIDER_VAULT_KEY_CATALOG }, null, 2))"`,
  { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
)

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, json)
const entries = JSON.parse(json).entries
console.error(`Wrote ${entries.length} provider entries → ${outPath}`)
