// Single source of truth for SEO: the canonical site origin + URL helpers, shared by
// the sitemap, robots, per-page metadata, and JSON-LD so they can never drift apart.
// APP_URL is set in Vercel env; falls back to the production domain for local/build.
export const SITE_URL = (process.env.APP_URL ?? 'https://linestickerranking.com').replace(/\/$/, '');
export const SITE_NAME = 'LineStickerRanking';

// LINE's CDN image for a sticker pack's main thumbnail (used as the OG/social preview).
export function stickerImage(id: string): string {
  return `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`;
}
