import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Electron desktop bundles `.next/standalone` (see `desktop/`). */
  output: 'standalone',
  /** Monorepo: trace file inclusion from repo root when multiple lockfiles exist. */
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Externalize workspace packages so Next does not webpack their AWS/Effect graphs.
  // Do not list `effect` here — Next may auto-transpile it and rejects the conflict.
  serverExternalPackages: ['clawql-api', 'clawql-auth', 'clawql-core'],
}

export default nextConfig
