import type { Metadata } from 'next';
import FavoritesClient from './FavoritesClient';

// Favorites live in the browser's localStorage (per-device), so there's nothing crawlable here —
// keep it out of the index. Its own page now (not an inline panel on the homepage) so the
// homepage stays a clean ranking board.
export const metadata: Metadata = {
  title: 'Your Favorites',
  robots: { index: false, follow: true },
  alternates: { canonical: '/favorites' },
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
