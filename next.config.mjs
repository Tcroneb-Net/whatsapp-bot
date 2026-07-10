/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      'sonner',
    ],
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 2,
  },
}

export default nextConfig
