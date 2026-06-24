import { COUNTRIES } from './countries';
import { getDb } from './db';
import { getAvailableDates, getAllRankings } from './linesticker-api';

const DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeCountryDate(country: string, date: string, snapshotHour?: number) {
  const client = getDb();
  const items = await getAllRankings(country, date);
  const now = new Date().toISOString();
  const hour = snapshotHour ?? new Date().getUTCHours();

  const statements = items.flatMap((item) => [
    {
      sql: `INSERT INTO products (id, name, image_url, author, price, price_currency, description, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              image_url = excluded.image_url,
              author = COALESCE(excluded.author, products.author),
              price = COALESCE(excluded.price, products.price),
              price_currency = COALESCE(excluded.price_currency, products.price_currency),
              description = COALESCE(excluded.description, products.description),
              updated_at = excluded.updated_at`,
      args: [
        item.sticker_id, item.title, item.image_url ?? null,
        item.author ?? null, item.price ?? null, item.price_currency ?? null,
        item.description ?? null, now,
      ] as (string | number | null)[],
    },
    {
      sql: `INSERT OR REPLACE INTO rankings (product_id, country, rank, snapshot_date, snapshot_hour, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [item.sticker_id, country, item.rank, date, hour, now] as (string | number | null)[],
    },
  ]);

  if (statements.length) {
    await client.batch(statements, 'write');
  }

  return items.length;
}

export async function runScrapeAll(options?: { daysBack?: number }) {
  const maxDays = options?.daysBack ?? 30;
  const summary: Record<string, { dates: number; items: number; error?: string }> = {};

  for (const country of COUNTRIES) {
    let totalItems = 0;
    let datesScraped = 0;

    try {
      const dates = await getAvailableDates(country.code);
      const datesToFetch = dates.slice(0, maxDays);

      for (const date of datesToFetch) {
        try {
          const n = await scrapeCountryDate(country.code, date);
          totalItems += n;
          datesScraped++;
          console.log(`[scraper] ${country.code} ${date}: ${n} items`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[scraper] ${country.code} ${date} error: ${msg}`);
        }
        await sleep(DELAY_MS);
      }

      summary[country.code] = { dates: datesScraped, items: totalItems };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${country.code} error: ${msg}`);
      summary[country.code] = { dates: 0, items: 0, error: msg };
    }
  }

  console.log('[scraper] Done:', JSON.stringify(summary));
  return summary;
}

export async function runDailyUpdate() {
  const summary: Record<string, { items: number; error?: string }> = {};

  for (const country of COUNTRIES) {
    try {
      const dates = await getAvailableDates(country.code);
      if (!dates.length) { summary[country.code] = { items: 0 }; continue; }

      const latestDate = dates[0];
      const n = await scrapeCountryDate(country.code, latestDate);
      summary[country.code] = { items: n };
      console.log(`[daily] ${country.code} ${latestDate}: ${n} items`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily] ${country.code} error: ${msg}`);
      summary[country.code] = { items: 0, error: msg };
    }
    await sleep(DELAY_MS);
  }

  return summary;
}
