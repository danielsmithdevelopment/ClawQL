import type { NextConfig } from 'next'

/** Empty for custom domain (clawql.com); set to /ClawQL for project Pages without a custom domain. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  output: 'export',
  poweredByHeader: false,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

export default nextConfig
