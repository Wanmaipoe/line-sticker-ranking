// Feature flag for the "For Advertising" CTA (the floating pill + the popup panel), parked while
// the site is being polished.
//
// Two layers, on purpose:
//  1. SITE-WIDE (what every visitor sees): the NEXT_PUBLIC_ADS_ENABLED env var. Unset/anything but
//     "1" = hidden. To bring the CTA back for everyone, set NEXT_PUBLIC_ADS_ENABLED=1 in the Vercel
//     project env and redeploy — no code change needed.
//  2. PER-BROWSER override (the footer toggle): localStorage, so the owner can preview the CTA on
//     their own machine without turning it on for the public. It does NOT affect other visitors.
export const ADS_SITE_DEFAULT = process.env.NEXT_PUBLIC_ADS_ENABLED === '1';
export const ADS_STORAGE_KEY = 'lsr_ads';

// Client-only. Must be called from an effect (never during render/SSR) — localStorage doesn't exist
// on the server, and reading it during render would cause a hydration mismatch.
export function readAdsEnabled(): boolean {
  try {
    const v = localStorage.getItem(ADS_STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* storage unavailable (private mode) — fall back to the site default */
  }
  return ADS_SITE_DEFAULT;
}
