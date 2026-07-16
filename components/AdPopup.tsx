'use client';

import { useState, useEffect } from 'react';
import { readAdsEnabled } from '@/lib/ads';

export default function AdPopup() {
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  // Parked feature: hidden unless NEXT_PUBLIC_ADS_ENABLED=1 (site-wide) or the footer toggle set a
  // per-browser override. Starts false so SSR and the first client render agree; the effect can
  // only ever turn it ON, never flash it off.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readAdsEnabled());
  }, []);

  // Auto-show once per browser session, then closeable. Floating button reopens it.
  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem('lsr_ad_shown')) return;
    } catch {
      /* sessionStorage unavailable */
    }
    // Delay ~9s so the ad panel doesn't hijack the first impression / compete with the rankings
    // on load. The floating "For Advertising" button is always available to open it sooner.
    const t = setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem('lsr_ad_shown', '1');
      } catch {
        /* ignore */
      }
    }, 9000);
    return () => clearTimeout(t);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 bg-gray-900 text-white text-xs font-medium px-3.5 py-2 rounded-full shadow-lg hover:bg-gray-800 transition-colors"
      >
        📢 For Advertising
      </button>

      {open && (
        <div className="fixed top-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-10 bg-white/80 backdrop-blur rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700 text-xl leading-none shadow"
            aria-label="Close"
          >
            ×
          </button>
          <a href="mailto:linestickerranking@gmail.com?subject=Advertising%20inquiry" className="block">
            {imgOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/animated.png"
                alt="For Advertising — linestickerranking@gmail.com"
                onError={() => setImgOk(false)}
                className="w-full h-auto block"
              />
            ) : (
              <div className="p-6">
                <h3 className="font-bold text-gray-800 text-lg mb-2">📢 For Advertising</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Want to reach LINE sticker fans &amp; creators? Get in touch:
                </p>
                <div className="text-center bg-green-500 text-white text-sm font-medium py-2.5 rounded-xl">
                  linestickerranking@gmail.com
                </div>
              </div>
            )}
          </a>
        </div>
      )}
    </>
  );
}
