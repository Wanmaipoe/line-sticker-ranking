'use client';

import { useState, useEffect } from 'react';
import { readAdsEnabled, ADS_STORAGE_KEY } from '@/lib/ads';

// Footer switch that brings the parked "For Advertising" CTA back — for THIS browser only
// (localStorage). It's a preview/owner convenience: turning the CTA on for every visitor is the
// NEXT_PUBLIC_ADS_ENABLED env var in Vercel, not this button. Renders nothing until the stored
// value is read, so SSR and hydration always match.
export default function AdsToggle() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(readAdsEnabled());
  }, []);

  if (on === null) return null;

  function toggle() {
    try {
      localStorage.setItem(ADS_STORAGE_KEY, on ? '0' : '1');
    } catch {
      /* storage unavailable — nothing to persist */
    }
    // Simplest reliable way to re-run the CTA's mount logic (session-once popup timer included).
    window.location.reload();
  }

  return (
    <button
      onClick={toggle}
      title={
        on
          ? 'Hide the advertising CTA on this browser'
          : 'Show the advertising CTA on this browser (preview only — not visible to other visitors)'
      }
      className="text-gray-300 hover:text-gray-500 underline underline-offset-2 transition-colors"
    >
      {on ? 'Disable advertising' : 'Enable advertising'}
    </button>
  );
}
