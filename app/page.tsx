import { getDb } from '@/lib/db';
import { getDashboardData, getTrendingData, type DashboardData, type TrendingCountry } from '@/lib/homedata';
import HomeClient from './HomeClient';

// ISR: server-render the homepage with the REAL ranking data in the initial HTML (so AI crawlers
// and no-JS clients can read and cite the actual Top-5 lists), cached for 10 min. Reuses the same
// index-driven queries the /api routes use, so this relocates the homepage's reads from the
// client-fetched API caches to one ISR cache (net neutral) rather than adding new ones.
export const revalidate = 600;

export default async function Page() {
  const client = getDb();
  let initialDashboard: DashboardData | null = null;
  let initialTrending: { countries: TrendingCountry[] } | null = null;
  try {
    initialDashboard = await getDashboardData(client);
  } catch {
    // DB unreadable — HomeClient falls back to a client fetch and shows skeletons meanwhile.
  }
  try {
    initialTrending = await getTrendingData(client);
  } catch {
    // same graceful fallback
  }
  return <HomeClient initialDashboard={initialDashboard} initialTrending={initialTrending} />;
}
