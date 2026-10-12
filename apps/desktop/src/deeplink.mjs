/**
 * Parse PhoneApprove deep links — same shapes as apps/mobile push.ts.
 * clawql://review/:id · https://cloud.clawql.com/app/review/:id · ?requestId=
 */

/**
 * @param {string} url
 * @returns {string | null}
 */
export function parseApprovalDeepLink(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url)
    const fromQuery = u.searchParams.get('requestId')
    if (fromQuery) return fromQuery

    const parts = [
      u.hostname &&
      u.hostname !== 'cloud.clawql.com' &&
      u.hostname !== 'acme.cloud.clawql.com'
        ? u.hostname
        : null,
      ...u.pathname.split('/'),
    ].filter((p) => Boolean(p && p.length > 0))

    if (parts[0] === 'app') parts.shift()
    if (parts[0] === 'review' && parts[1]) return parts[1]
    return null
  } catch {
    return null
  }
}

/**
 * @param {string} requestId
 * @param {{ port?: number }} [opts]
 */
export function reviewUrlForDesktop(requestId, opts = {}) {
  const port = opts.port ?? 3040
  return `http://127.0.0.1:${port}/review?requestId=${encodeURIComponent(requestId)}`
}

/**
 * Collect candidate deep-link URLs from process argv (cold start).
 * @param {string[]} argv
 * @returns {string[]}
 */
export function deepLinkUrlsFromArgv(argv) {
  return argv.filter(
    (a) =>
      typeof a === 'string' &&
      (a.startsWith('clawql://') ||
        a.startsWith('https://cloud.clawql.com/') ||
        a.startsWith('https://acme.cloud.clawql.com/')),
  )
}
