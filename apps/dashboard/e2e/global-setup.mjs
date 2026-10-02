import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { kubectlApplyFile, kubectlRun } from './kubectl-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NS = process.env.CLAWQL_DASHBOARD_E2E_NAMESPACE ?? 'clawql-dashboard-e2e'
const DEPLOY = process.env.CLAWQL_DASHBOARD_E2E_DEPLOYMENT ?? 'clawql-dashboard-e2e-target'

export default async function globalSetup() {
  if (process.env.CLAWQL_DASHBOARD_E2E !== '1') return

  const fixtures = path.join(__dirname, 'fixtures')
  kubectlApplyFile(path.join(fixtures, 'namespace.yaml'))
  kubectlApplyFile(path.join(fixtures, 'deployment.yaml'))

  kubectlRun(['rollout', 'status', `deployment/${DEPLOY}`, '-n', NS, '--timeout=180s'])
}
