import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'stickershop.line-scdn.net',
        pathname: '/stickershop/v1/product/**',
      },
    ],
  },
};

export default nextConfig;
