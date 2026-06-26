'use client';

import { useState, useEffect } from 'react';

export default function AdPopup() {
  const [open, setOpen] = useState(false);

  // Auto-show once per browser session (not on every page), then closeable. The
  // floating button can still reopen it anytime.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('lsr_ad_shown')) return;
    } catch {
      /* sessionStorage unavailable */
    }
    const t = setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem('lsr_ad_shown', '1');
      } catch {
        /* ignore */
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 bg-gray-900 text-white text-xs font-medium px-3.5 py-2 rounded-full shadow-lg hover:bg-gray-800 transition-colors"
      >
        📢 For Advertising
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 text-lg">📢 For Advertising</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Want to reach LINE sticker fans &amp; creators across Japan, Thailand, Taiwan, Indonesia &amp; the US?
              Get in touch:
            </p>
            <a
              href="mailto:linestickerranking@gmail.com?subject=Advertising%20inquiry"
              className="block mt-4 text-center bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              linestickerranking@gmail.com
            </a>
          </div>
        </div>
      )}
    </>
  );
}
