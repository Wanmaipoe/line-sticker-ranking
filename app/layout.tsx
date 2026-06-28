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

const TITLE = "LineStickerRanking — Live LINE Sticker Rankings Across Asia";
const DESCRIPTION =
  "Track LINE sticker rankings across Japan, Thailand, Taiwan, Indonesia & the US — refreshed hourly, with 30-day rank history, top creators, and the biggest movers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | LineStickerRanking" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  keywords: [
    "LINE sticker",
    "LINE sticker ranking",
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
    alternateLocale: ["th_TH", "ja_JP"],
    images: [{ url: "/icon.png", width: 456, height: 469, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon.png"],
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
