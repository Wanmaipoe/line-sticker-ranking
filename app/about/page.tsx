import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

// Static About / methodology page. Zero DB reads. Its job is E-E-A-T + entity clarity: AI answer
// engines and search weigh "who is behind this, where does the data come from, how is it made" when
// deciding whether to trust and cite a source — so this states all of it in plain server-rendered
// text, and declares the Organization + AboutPage structured data.
const TITLE = 'About LineStickerRanking — Methodology & Data Source';
const DESCRIPTION =
  'How LineStickerRanking tracks LINE sticker rankings: hourly data from LINE Store for Japan, Thailand and Taiwan, with 30-day rank history and creator leaderboards. Who runs it, how the data is collected, and our independence from LINE.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/about` },
};

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: TITLE,
    url: `${SITE_URL}/about`,
    description: DESCRIPTION,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    email: 'linestickerranking@gmail.com',
    foundingDate: '2026',
    description:
      'Independent tracker of LINE sticker popularity rankings for Japan, Thailand and Taiwan, updated hourly from LINE Store.',
    knowsAbout: ['LINE stickers', 'LINE Store rankings', 'LINE sticker creators'],
    parentOrganization: { '@type': 'Organization', name: '11tumarai Company' },
  },
];

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-bold text-gray-800">{q}</h2>
      <div className="text-sm text-gray-600 mt-1.5 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="text-sm text-green-600 hover:underline">← Back to rankings</a>
        </div>

        <h1 className="text-2xl font-bold text-gray-800">About LineStickerRanking</h1>
        <p className="text-gray-600 mt-3 leading-relaxed">
          LineStickerRanking is an independent tool that tracks which LINE stickers are the most
          popular right now in Japan, Thailand and Taiwan. We record the official LINE Store charts
          every hour and keep a 30-day history, so you can see not just today&apos;s top stickers but
          how each one is rising or falling over time.
        </p>

        <div className="mt-8 space-y-6 bg-white rounded-2xl border border-gray-100 p-6">
          <QA q="What data do you track?">
            <p>
              The top 500 creator stickers per country (Japan, Thailand and Taiwan on the homepage;
              Indonesia and the United States are also collected), each sticker&apos;s rank over the
              last 30 days, the biggest hourly movers, and a leaderboard of the creators with the
              most stickers in the charts.
            </p>
          </QA>
          <QA q="Where does the ranking data come from?">
            <p>
              Directly from LINE Store&apos;s public creator-sticker popularity charts
              (store.line.me), captured once per hour for each country. We do not estimate or model
              the ranks — they are LINE&apos;s own published ordering, recorded and given a
              timestamp and history.
            </p>
          </QA>
          <QA q="How often is it updated?">
            <p>
              Every hour, automatically. Each page shows when it was last updated (Bangkok time).
              Because we snapshot hourly, our figures can be up to about an hour behind LINE&apos;s
              continuously-moving live chart.
            </p>
          </QA>
          <QA q="Are you affiliated with LINE?">
            <p>
              No. LineStickerRanking is an independent project and is not affiliated with, endorsed
              by, or operated by LINE Corporation / LY Corporation. &quot;LINE&quot; and related
              marks belong to their respective owners. We simply read and organize the public
              rankings LINE already publishes.
            </p>
          </QA>
          <QA q="Who runs it?">
            <p>
              LineStickerRanking is built and maintained by a small independent team (11tumarai
              Company). For questions, corrections, data licensing, or advertising, contact{' '}
              <a href="mailto:linestickerranking@gmail.com" className="text-green-600 hover:underline">
                linestickerranking@gmail.com
              </a>
              .
            </p>
          </QA>
          <QA q="Can I use your data?">
            <p>
              Yes — you are welcome to reference our rankings with a link back to the relevant page.
              For bulk or commercial data use, get in touch and we&apos;ll help.
            </p>
          </QA>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Explore the live rankings for{' '}
          <a href="/country/jp" className="text-green-600 hover:underline">Japan</a>,{' '}
          <a href="/country/th" className="text-green-600 hover:underline">Thailand</a>, and{' '}
          <a href="/country/tw" className="text-green-600 hover:underline">Taiwan</a>, or see the{' '}
          <a href="/creators" className="text-green-600 hover:underline">top creators</a>.
        </p>
      </div>
      <JsonLd data={jsonLd} />
    </div>
  );
}
