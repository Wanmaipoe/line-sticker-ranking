// Country codes supported by linesticker.app (ISO 3166-1 alpha-2)
export const COUNTRIES = [
  { code: 'th', name: 'Thailand', flag: '🇹🇭' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'kr', name: 'Korea', flag: '🇰🇷' },
  { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'my', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { code: 'hk', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'ph', name: 'Philippines', flag: '🇵🇭' },
  { code: 'vn', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'us', name: 'United States', flag: '🇺🇸' },
  { code: 'gb', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'cn', name: 'China', flag: '🇨🇳' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦' },
] as const;

export type CountryCode = typeof COUNTRIES[number]['code'];

export const COUNTRY_MAP = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
) as Record<string, typeof COUNTRIES[number]>;

// The only markets we track and display, in priority order (by LINE MAU:
// Japan ~96M, Thailand ~54M, Taiwan ~23M, Indonesia ~20M, US ~3M). Everything
// country-related — scraping, tables, leaderboard, footprint — uses this list and
// this order. Other countries have too few LINE users to rank meaningfully.
export const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

export const COUNTRY_ORDER: Record<string, number> = Object.fromEntries(
  FEATURED_COUNTRIES.map((c, i) => [c, i])
);

export function isFeaturedCountry(code: string): boolean {
  return (FEATURED_COUNTRIES as readonly string[]).includes(code);
}
