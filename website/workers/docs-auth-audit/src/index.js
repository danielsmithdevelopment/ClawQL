/**
 * Path-scoped static Worker for docs.clawql.com /auth and /audit.
 *
 * The main OpenNext Worker (`clawql-docs`) exceeds the free-plan 3 MiB gzip
 * limit, so new docs routes cannot ship through that deploy path. Exact-path
 * zone routes for /auth and /audit take precedence for those URLs; /auth.md
 * and the rest of the site stay on clawql-docs (custom domain).
 *
 * Deploy: `npx wrangler deploy` from this directory (needs CLOUDFLARE_API_TOKEN).
 * Regenerate HTML: `node scripts/generate-pages.mjs`
 */

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)

    if (path !== '/auth' && path !== '/audit') {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    // Serve the directory index via ASSETS (html_handling: drop-trailing-slash).
    const assetUrl = new URL(`/${path.slice(1)}/index.html`, url.origin)
    const response = await env.ASSETS.fetch(new Request(assetUrl, request))

    if (response.status === 404) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    const headers = new Headers(response.headers)
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.set(
      'cache-control',
      'public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=300',
    )
    headers.set('x-clawql-static-auth-audit', '1')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
