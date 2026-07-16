import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { REVENUE_COOKIE, isConfigured, verifyToken } from '@/lib/revenue/auth';
import RevenueLogin from './RevenueLogin';
import RevenueClient from './RevenueClient';

// Private team tool: keep it out of every index, and out of the sitemap (see app/robots.ts).
export const metadata: Metadata = {
  title: 'Revenue distribution',
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: '/revenue' },
};

// Reads a cookie, so it can never be statically rendered or cached.
export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  const jar = await cookies();
  if (!verifyToken(jar.get(REVENUE_COOKIE)?.value)) {
    return <RevenueLogin configured={isConfigured()} />;
  }
  return <RevenueClient />;
}
