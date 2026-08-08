import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No remote image hosts, no external rewrites, no analytics endpoint.
  // Absence of an outbound path is the enforcement of N9.
  poweredByHeader: false,
}

export default nextConfig
