const BASE = 'https://linesticker.app';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`linesticker.app${path} → HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`linesticker.app${path} → success=false`);
  return json;
}

export interface LsSticker {
  id: number;
  item_type: 'sticker' | 'emoji';
  sticker_id: string;
  url: string;
  title: string;
  image_url: string;
}

export interface LsRankItem extends LsSticker {
  rank: number;
}

export interface LsMeta {
  count: number;
  hasMore: boolean;
  nextCursor?: number;
}

// Search stickers by name
export async function searchStickers(query: string, limit = 20): Promise<LsSticker[]> {
  const r = await apiFetch<{ success: true; data: LsSticker[]; meta: LsMeta }>(
    `/api/stickers?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return r.data;
}

// Get available dates that have ranking data for a country
export async function getAvailableDates(country: string): Promise<string[]> {
  const r = await apiFetch<{ success: true; data: string[] }>(`/api/dates?country=${country}`);
  return r.data;
}

// Fetch one page of rankings for a country + date
export async function getRankingsPage(
  country: string,
  date: string,
  limit = 50,
  offset = 0
): Promise<{ data: LsRankItem[]; hasMore: boolean }> {
  const r = await apiFetch<{ success: true; data: LsRankItem[]; meta: LsMeta }>(
    `/api/rankings?country=${country}&date=${date}&limit=${limit}&offset=${offset}`
  );
  return { data: r.data, hasMore: r.meta.hasMore };
}

// Fetch ALL rankings for a country + date (handles pagination)
export async function getAllRankings(country: string, date: string): Promise<LsRankItem[]> {
  const all: LsRankItem[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { data, hasMore } = await getRankingsPage(country, date, limit, offset);
    all.push(...data);
    if (!hasMore) break;
    offset += limit;
    await sleep(300);
  }

  return all;
}

// Find rank of a specific sticker in a country on a date (returns null if not ranked)
export async function findStickerRank(
  stickerId: string,
  country: string,
  date: string
): Promise<number | null> {
  let offset = 0;
  const limit = 50;

  while (true) {
    const { data, hasMore } = await getRankingsPage(country, date, limit, offset);
    const found = data.find((item) => item.sticker_id === stickerId);
    if (found) return found.rank;
    if (!hasMore) return null;
    offset += limit;
    await sleep(200);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
