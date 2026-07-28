import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import ClarityAnalytics from "@/components/ClarityAnalytics";
import ThemeToggle from "@/components/ThemeToggle";

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
  "Live LINE sticker ranking updated every hour. Top 500 charts for Japan, Thailand & Taiwan, 30-day rank history and LINE creator rankings.";

// The site supports both themes; "light dark" tells the browser its UA styling may go either way
// (the actual per-visitor theme is set pre-paint by THEME_INIT + the CSS color-scheme that follows
// the .dark class). Do NOT pin this back to "light" — that reintroduces the white-on-white input bug
// in dark mode by freezing native form controls to the light palette.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

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
    email: "linestickerranking@gmail.com",
    foundingDate: "2026",
    description:
      "Independent tracker of LINE sticker popularity rankings for Japan, Thailand and Taiwan, updated hourly from LINE Store.",
    knowsAbout: ["LINE stickers", "LINE Store rankings", "LINE sticker creators"],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // No className on <html>: the pre-paint theme script (first child of <body>) adds a `.dark`/`.light`
  // class to <html>, and React only leaves script-added attributes alone on <html>/<body> when it
  // isn't managing that attribute via a prop. Passing className to <html> would make React reconcile
  // it on hydration and WIPE the script's class. So font vars + utilities live on <body>, and the
  // html height is set in globals.css. suppressHydrationWarning covers the script's attribute changes.
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-full flex flex-col`}
      >
        {/* Re-applies a SAVED manual theme override (localStorage `theme`) before paint, so a visitor
            who picked a theme different from their OS doesn't flash the OS theme on load. No saved
            choice => no-op: the CSS media query in globals.css already follows the OS with zero JS, so
            the core "match my browser" behavior holds even if this never runs. Raw inline <script> in
            the SSR HTML stream (parsed + executed before body paint); keep it the FIRST child of
            <body>. Keep in sync with ThemeToggle's class/colorScheme logic. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light')return;var e=document.documentElement;e.classList.add(t);e.style.colorScheme=t;}catch(e){}})();",
          }}
        />
        {children}
        <ThemeToggle />
        <JsonLd data={SITE_JSONLD} />
        <Analytics />
        <SpeedInsights />
        <ClarityAnalytics />
      </body>
    </html>
  );
}
