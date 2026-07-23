// Display taxonomy for the character-type ranking feature (/characters).
//
// Unlike sticker categories (lib/categories.ts), the character of a pack is NOT a free signal from
// the scraper — LINE exposes no "this pack is a cat" marker. It's derived by a vision model
// (Cloudflare Moondream) in scripts/classify-characters.mjs, which writes one of the keys below into
// products.character_type. Admins can correct a label by hand (products.character_source = 'manual'),
// and the classifier then leaves that row alone.
//
// The free-text-answer -> key mapping lives in the classifier script (it's the only place that maps
// Moondream's prose). KEEP THE KEY LIST HERE IN SYNC with mapBucket() in scripts/classify-characters.mjs.

export interface CharacterCategory {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
}

export const CHARACTER_CATEGORIES: CharacterCategory[] = [
  { key: 'cat', label: 'Cat', emoji: '🐱', blurb: 'Packs whose star is a cat or kitten.' },
  { key: 'dog', label: 'Dog', emoji: '🐶', blurb: 'Packs led by a dog or puppy.' },
  { key: 'rabbit', label: 'Rabbit', emoji: '🐰', blurb: 'Bunnies and rabbits.' },
  { key: 'bear', label: 'Bear', emoji: '🐻', blurb: 'Bears and teddy-bear characters.' },
  { key: 'bird', label: 'Bird', emoji: '🐦', blurb: 'Birds, chicks, ducks and penguins.' },
  { key: 'hamster', label: 'Hamster', emoji: '🐹', blurb: 'Hamsters and other tiny rodents.' },
  { key: 'panda', label: 'Panda', emoji: '🐼', blurb: 'Panda characters.' },
  { key: 'human', label: 'Human', emoji: '🧑', blurb: 'People — girls, boys, and figures.' },
  { key: 'food', label: 'Food', emoji: '🍔', blurb: 'Food and drink, no character.' },
  { key: 'other', label: 'Other', emoji: '✨', blurb: 'Everything else — other animals, objects, mixed art.' },
];

export const CHARACTER_MAP: Record<string, CharacterCategory> = Object.fromEntries(
  CHARACTER_CATEGORIES.map((c) => [c.key, c])
);

/** The set of valid character keys — used to validate an admin override and to gate grouping. */
export const CHARACTER_KEYS: readonly string[] = CHARACTER_CATEGORIES.map((c) => c.key);

export function isCharacterKey(v: unknown): v is string {
  return typeof v === 'string' && CHARACTER_KEYS.includes(v);
}

/**
 * Normalise a stored character_type into a valid key. Returns null for "not classified yet"
 * (character_type IS NULL) so the ranking can skip those rows; a stray/legacy value maps to 'other'.
 */
export function characterOf(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return CHARACTER_KEYS.includes(stored) ? stored : 'other';
}
