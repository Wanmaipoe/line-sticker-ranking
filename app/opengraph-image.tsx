import { ImageResponse } from 'next/og';

// File-convention OG image for the site root. Inherited by every route that does
// not set its own og:image (homepage, /creators, /country/*, /creator/*). Sticker
// pages override this with the actual sticker artwork in their own generateMetadata.
// Pure CSS/text so it renders at build time with zero external asset dependencies.

export const alt = 'LineStickerRanking — Live LINE Sticker Rankings Across Asia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '76px 80px',
          background: 'linear-gradient(135deg, #06c755 0%, #03a14a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 22px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            color: '#ffffff',
            fontSize: 26,
            letterSpacing: 3,
            marginBottom: 30,
          }}
        >
          LIVE RANKINGS
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 92,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -2,
          }}
        >
          LineStickerRanking
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.96)',
            fontSize: 38,
            marginTop: 26,
            maxWidth: 940,
            lineHeight: 1.3,
          }}
        >
          Track the top LINE stickers across Asia, refreshed every hour.
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 27,
            marginTop: 44,
            letterSpacing: 4,
          }}
        >
          JAPAN · THAILAND · TAIWAN · INDONESIA · USA
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 27,
            marginTop: 30,
          }}
        >
          linestickerranking.com
        </div>
      </div>
    ),
    { ...size }
  );
}
