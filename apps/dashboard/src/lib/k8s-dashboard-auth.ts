/** Timing-safe compare for Bearer tokens (UTF-8 code units). */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

export function k8sSyncAllowed(): boolean {
  const v = process.env.CLAWQL_DASHBOARD_ALLOW_K8S_SYNC?.trim()
  if (v === '1') return true
  if (v === '0') return false
  // Local dashboard dev defaults to enabled; production still requires explicit opt-in.
  return process.env.NODE_ENV !== 'production'
}

/**
 * Require `CLAWQL_DASHBOARD_SYNC_TOKEN` and a matching Bearer header.
 * Fail closed when the token is unset (no anonymous k8s sync).
 */
export function k8sSyncAuthOk(req: Request): boolean {
  const expected = process.env.CLAWQL_DASHBOARD_SYNC_TOKEN?.trim()
  if (!expected) return false
  const hdr = req.headers.get('authorization')?.trim() ?? ''
  return timingSafeEqualString(hdr, `Bearer ${expected}`)
}
