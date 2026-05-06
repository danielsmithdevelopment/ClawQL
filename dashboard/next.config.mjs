import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Monorepo: trace file inclusion from repo root when multiple lockfiles exist. */
  outputFileTracingRoot: path.join(__dirname, '..'),
}

export default nextConfig
