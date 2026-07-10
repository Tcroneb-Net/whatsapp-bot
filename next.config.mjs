/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  swcMinify: true,
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Optimize builds for resource-constrained environments
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      'sonner',
    ],
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000, // 15 minutes
    pagesBufferLength: 2,
  },
}

export default nextConfig
