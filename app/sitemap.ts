import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';
import { SITE_URL } from '@/lib/seo';

// Regenerated daily (ISR) so new stickers/creators appear without a redeploy, while a crawler
// hitting /sitemap.xml doesn't re-query the DB more than once a day. The URL list barely changes
// hour to hour, so daily is plenty and saves a full ~17k-row read every hour.
export const revalidate = 86400;

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = getDb();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/th`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/creators`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...FEATURED.map((cc) => ({
      url: `${SITE_URL}/country/${cc}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    })),
  ];

  let stickerRoutes: MetadataRoute.Sitemap = [];
  let creatorRoutes: MetadataRoute.Sitemap = [];

  try {
    // Every sticker in the DB has charted at least once, so each /sticker page has real,
    // indexable content (live rank + 30-day history). ~15k rows → well under the 50k limit.
    const products = await client.execute('SELECT id, updated_at FROM products ORDER BY updated_at DESC');
    stickerRoutes = products.rows.map((r) => {
      const d = r.updated_at ? new Date(r.updated_at as string) : null;
      return {
        url: `${SITE_URL}/sticker/${r.id as string}`,
        // One unparseable timestamp would make Next's XML serializer throw and 500 the whole
        // sitemap, so fall back to `now` on any invalid date.
        lastModified: d && !isNaN(d.getTime()) ? d : now,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      };
    });

    const authors = await client.execute(
      "SELECT DISTINCT author FROM products WHERE author IS NOT NULL AND TRIM(author) != ''"
    );
    creatorRoutes = authors.rows
      .map((r) => r.author as string)
      // An author whose name contains '/' encodes to %2F, which Next collapses back to a path
      // separator and can't match in a single [name] segment — that URL would never resolve,
      // so don't advertise it.
      .filter((author) => !author.includes('/'))
      .map((author) => ({
        url: `${SITE_URL}/creator/${encodeURIComponent(author)}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));
  } catch {
    // DB unreadable (e.g. Turso read quota) — still return the static routes so the sitemap and
    // the build never fail; sticker/creator URLs reappear on the next daily revalidate.
  }

  return [...staticRoutes, ...stickerRoutes, ...creatorRoutes];
}
