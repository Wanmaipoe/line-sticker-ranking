import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

// File-convention OG image for the site root. Inherited by every route that does
// not set its own og:image (homepage, /creators, /country/*, /creator/*). Sticker
// pages override this with the actual sticker artwork in their own generateMetadata.
// Static so it renders once at build time. The QR (public/qr.png) is read from disk
// and inlined; the try/catch means a missing file degrades to a card without the QR
// rather than failing the whole build.

export const alt = 'LineStickerRanking — Live LINE Sticker Rankings Across Asia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function qrDataUri(): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'qr.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export default function OpengraphImage() {
  const qr = qrDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '70px',
          background: 'linear-gradient(135deg, #06c755 0%, #03a14a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Left: text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            maxWidth: 760,
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
              fontSize: 24,
              letterSpacing: 3,
              marginBottom: 28,
            }}
          >
            LIVE RANKINGS
          </div>

          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: 66,
              fontWeight: 800,
              lineHeight: 1.0,
              letterSpacing: -2,
              whiteSpace: 'nowrap',
            }}
          >
            LineStickerRanking
          </div>

          <div
            style={{
              display: 'flex',
              color: 'rgba(255,255,255,0.96)',
              fontSize: 34,
              marginTop: 24,
              maxWidth: 700,
              lineHeight: 1.3,
            }}
          >
            Track the top LINE stickers across Asia, refreshed every hour.
          </div>

          <div
            style={{
              display: 'flex',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 23,
              marginTop: 38,
              letterSpacing: 3,
            }}
          >
            JAPAN · THAILAND · TAIWAN · INDONESIA · USA
          </div>

          <div
            style={{
              display: 'flex',
              color: 'rgba(255,255,255,0.72)',
              fontSize: 25,
              marginTop: 26,
            }}
          >
            linestickerranking.com
          </div>
        </div>

        {/* Right: QR */}
        {qr ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: '#ffffff',
              borderRadius: 28,
              padding: '24px 24px 18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={210} height={210} alt="" />
            <div
              style={{
                display: 'flex',
                marginTop: 14,
                fontSize: 22,
                color: '#03a14a',
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              SCAN TO VISIT
            </div>
          </div>
        ) : null}
      </div>
    ),
    { ...size }
  );
}
