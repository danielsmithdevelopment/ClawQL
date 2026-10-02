export function k8sSyncAllowed(): boolean {
  const v = process.env.CLAWQL_DASHBOARD_ALLOW_K8S_SYNC?.trim()
  if (v === '1') return true
  if (v === '0') return false
  // Local dashboard dev defaults to enabled; production still requires explicit opt-in.
  return process.env.NODE_ENV !== 'production'
}

export function k8sSyncAuthOk(req: Request): boolean {
  const expected = process.env.CLAWQL_DASHBOARD_SYNC_TOKEN?.trim()
  if (!expected) return true
  const hdr = req.headers.get('authorization')?.trim()
  return hdr === `Bearer ${expected}`
}
