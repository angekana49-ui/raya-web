import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@supabase/supabase-js",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Active la compression gzip/brotli
  compress: true,
  // Optimisations de production
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
