import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import ClarityAnalytics from "@/components/ClarityAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SEO: lead with the exact search phrase "LINE Sticker Ranking" (spaced, not the camelCase
// brand) — Google tokenizes the spaced phrase better and shows ~60 chars of title.
const TITLE = "LINE Sticker Ranking — Live Top 500 Charts, Updated Hourly";
const DESCRIPTION =
  "Live LINE sticker ranking updated every hour. Top 500 charts for Japan, Thailand, Taiwan, Indonesia & the US, 30-day rank history and LINE creator rankings.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | LineStickerRanking" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  // hreflang cluster: the root + the localized landing pages (/th, /ja, /zh-hant). Every
  // member must list ALL members plus itself and x-default, and the maps must match the
  // ones in app/th/page.tsx, app/ja/page.tsx and app/zh-hant/page.tsx exactly — a one-sided
  // or non-self-referencing cluster gets ignored by Google. Pages that define their own
  // `alternates` (sticker/country/creator/creators) override this and stay hreflang-free
  // on purpose: only the landing pages are localized.
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      th: "/th",
      ja: "/ja",
      "zh-Hant": "/zh-hant",
      "x-default": "/",
    },
  },
  keywords: [
    "LINE sticker",
    "LINE sticker ranking",
    "LINE ranking",
    "LINE creator ranking",
    "creator ranking",
    "LINE sticker chart",
    "top LINE stickers",
    "สติกเกอร์ไลน์",
    "อันดับสติกเกอร์ไลน์",
    "สติกเกอร์ไลน์ยอดนิยม",
    "LINE store ranking",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    alternateLocale: ["th_TH", "ja_JP", "zh_TW"],
    // og:image is provided by the file-convention app/opengraph-image.tsx (1200x630).
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // twitter:image is provided by the file-convention app/twitter-image.tsx.
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// Site-wide structured data: tells search engines the site identity + publisher.
const SITE_JSONLD = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <JsonLd data={SITE_JSONLD} />
        <Analytics />
        <SpeedInsights />
        <ClarityAnalytics />
      </body>
    </html>
  );
}
