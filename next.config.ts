import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/dunecatalog',
  assetPrefix: '/dunecatalog',
  output: 'standalone',
  trailingSlash: true,
  poweredByHeader: false,
};

export default nextConfig;
