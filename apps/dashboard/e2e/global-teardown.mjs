import { kubectlRun } from './kubectl-helpers.mjs'

const NS = process.env.CLAWQL_DASHBOARD_E2E_NAMESPACE ?? 'clawql-dashboard-e2e'
const DEPLOY = process.env.CLAWQL_DASHBOARD_E2E_DEPLOYMENT ?? 'clawql-dashboard-e2e-target'

export default async function globalTeardown() {
  if (process.env.CLAWQL_DASHBOARD_E2E !== '1') return
  kubectlRun(['delete', 'deployment', DEPLOY, '-n', NS, '--ignore-not-found'])
}
