// Display categories for the category-ranking feature, and the map from the scraper's raw
// sticker_type onto them.
//
// Only the types LINE exposes as an icon on its "top creators" ranking list can appear here —
// that's what the scraper reads for free (see scripts/scrape-line-official.mjs). Big Stickers have
// no distinct list icon, so they currently fold into 'static' and can't be split out; Effect
// stickers essentially never chart in that mixed ranking. Surfacing those two would need scraping
// LINE's separate per-category ranking pages (more requests + more Turso writes) — deliberately out
// of scope per the 2026-07-21 decision to ship the free "filter the ranking we already have"
// version only.
export interface StickerCategory {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
}

export const STICKER_CATEGORIES: StickerCategory[] = [
  { key: 'stickers', label: 'Stickers', emoji: '💬', blurb: 'Classic static sticker packs.' },
  { key: 'animated', label: 'Animated', emoji: '▶️', blurb: 'Packs that move — animation (and sound).' },
  { key: 'popup', label: 'Pop-up', emoji: '⤢', blurb: 'Pop-up stickers that burst over the chat.' },
  { key: 'custom', label: 'Custom', emoji: '✏️', blurb: 'Custom stickers you personalise before sending.' },
  { key: 'message', label: 'Message', emoji: '💌', blurb: 'Message stickers with editable text.' },
];

export const CATEGORY_MAP: Record<string, StickerCategory> = Object.fromEntries(
  STICKER_CATEGORIES.map((c) => [c.key, c])
);

// Raw scraper sticker_type -> category key. Anything unknown or missing falls back to 'stickers'
// (the scraper's own default for a pack with no type icon).
const RAW_TO_CATEGORY: Record<string, string> = {
  static: 'stickers',
  animation: 'animated',
  sound: 'animated', // sound packs are animated-with-sound
  popup: 'popup',
  popup_sound: 'popup',
  'popup-effect': 'popup',
  name: 'custom',
  message: 'message',
};

export function categoryOf(rawType: string | null | undefined): string {
  if (!rawType) return 'stickers';
  return RAW_TO_CATEGORY[rawType] ?? 'stickers';
}
