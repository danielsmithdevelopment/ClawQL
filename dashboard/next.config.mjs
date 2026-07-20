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
  // Keep clawql-api (and its AWS/Effect stack) out of the webpack graph — Docker and
  // Electron resolve them from node_modules / file: packages at runtime.
  serverExternalPackages: [
    'clawql-api',
    'clawql-auth',
    'clawql-core',
    'effect',
    '@aws-crypto/sha256-js',
    '@smithy/protocol-http',
    '@smithy/signature-v4',
    '@smithy/core',
  ],
}

export default nextConfig
