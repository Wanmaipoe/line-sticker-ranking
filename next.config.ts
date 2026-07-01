import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve sticker thumbnails straight from LINE's CDN. They're already small PNGs on a fast
    // CDN, so routing them through Vercel's image optimizer added no benefit and burned the
    // plan's Image Optimization quota — once exhausted the optimizer returns HTTP 402
    // (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED), which silently broke images for every newly
    // added sticker (already-optimized ones kept serving from cache). Bypass the optimizer.
    unoptimized: true,
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
