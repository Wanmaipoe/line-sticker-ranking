import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

// Traditional Chinese (Taiwan) landing page targeting native queries ("line貼圖 排行榜",
// "line貼圖 排名", "line 熱門貼圖", "日本 line貼圖 排行" — TW users actively search for
// JAPAN's charts, so the hero offers both TW and JP entry points).
// Fully static: no DB access, prerendered at build, zero Turso reads.
// hreflang cluster member — the alternates.languages map below must stay identical to the
// maps in app/layout.tsx, app/th/page.tsx and app/ja/page.tsx.

const TITLE_ZH = 'LINE貼圖排行榜｜Top 500 每小時更新';
const DESC_ZH =
  '即時追蹤LINE熱門貼圖排行榜，完整Top 500每小時更新，附30天排名走勢圖與創作者排行。台灣、日本、泰國、印尼、美國5國一次看，免費查詢自己貼圖的排名。';

export const metadata: Metadata = {
  title: TITLE_ZH,
  description: DESC_ZH,
  alternates: {
    canonical: '/zh-hant',
    languages: {
      en: '/',
      th: '/th',
      ja: '/ja',
      'zh-Hant': '/zh-hant',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    title: TITLE_ZH,
    description: DESC_ZH,
    url: `${SITE_URL}/zh-hant`,
    locale: 'zh_TW',
  },
};

const PAGE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE_ZH,
  description: DESC_ZH,
  url: `${SITE_URL}/zh-hant`,
  inLanguage: 'zh-Hant',
  isPartOf: { '@type': 'WebSite', name: 'LineStickerRanking', url: SITE_URL },
};

const FEATURES = [
  {
    icon: '⏱',
    title: '每小時更新',
    body: '每小時從LINE STORE記錄一次排名，不用等官方的每月MVP或年度回顧。',
  },
  {
    icon: '📈',
    title: '30天排名走勢圖',
    body: '點任何一組貼圖，就能看到過去30天的排名變化，什麼時候衝上去、什麼時候掉下來，一目瞭然。',
  },
  {
    icon: '🌏',
    title: '5國排行一次看',
    body: '台灣、日本、泰國、印尼、美國的排行榜都在這裡。想知道日本現在的熱門貼圖是哪些？切換國家馬上看。',
  },
  {
    icon: '🏅',
    title: '創作者排行榜',
    body: '哪位創作者的貼圖佔據Top 100最多？日本、泰國、台灣的即時統計，每小時更新。',
  },
];

const FAQ = [
  {
    q: '排名資料是從哪裡來的？',
    a: '直接從LINE STORE（store.line.me）的人氣創作者貼圖頁面取得，每小時記錄一次，各國分開統計。',
  },
  {
    q: '跟LINE STORE的排行榜有什麼不同？',
    a: 'LINE STORE只顯示現在的名次，這裡保留30天的歷史紀錄，看得到上升和下降的完整走勢，還能跨國比較，例如台灣和日本的排行榜並排看。',
  },
  {
    q: '要付費或註冊嗎？',
    a: '完全免費，也不用註冊，打開就能看。',
  },
];

export default function TraditionalChineseLandingPage() {
  return (
    // The root layout is lang="en"; this wrapper re-declares Traditional Chinese for this
    // page's content (screen readers + non-Google engines — Google detects language from text).
    <div lang="zh-Hant" className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-800 text-lg">LineStickerRanking</span>
          <a href="/" className="text-sm text-green-600 hover:underline">English</a>
        </div>

        {/* Hero */}
        <div className="text-center mt-10 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            LINE貼圖排行榜（每小時更新）
          </h1>
          <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
            每小時記錄LINE STORE人氣創作者貼圖的Top 500排名，附30天排名走勢圖，
            涵蓋台灣、日本、泰國、印尼、美國5個國家。
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <a
              href="/country/tw"
              className="bg-green-600 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-green-700 transition-colors"
            >
              🇹🇼 看台灣排行榜
            </a>
            <a
              href="/country/jp"
              className="bg-white text-green-600 border border-green-200 font-medium px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors"
            >
              🇯🇵 看日本排行榜
            </a>
            <a
              href="/creators"
              className="bg-white text-green-600 border border-green-200 font-medium px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors"
            >
              🏅 創作者排行榜
            </a>
            <a
              href="/"
              className="bg-white text-gray-600 border border-gray-200 font-medium px-5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              🌏 全部國家
            </a>
          </div>
        </div>

        {/* Features */}
        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-700">
                {f.icon} {f.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1.5">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Creator how-to — targets "銷售量 怎麼看" / "銷量 查詢" intent */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 mt-8">
          <h2 className="font-bold text-gray-800 text-lg">查詢自己貼圖的排名</h2>
          <p className="text-sm text-gray-500 mt-2">
            如果你是在LINE Creators Market上架貼圖的創作者，想知道自己的作品現在排第幾，照這三個步驟就可以。
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 mt-3 space-y-1.5">
            <li>
              到<a href="/" className="text-green-600 hover:underline">首頁</a>
              的搜尋框，輸入貼圖名稱或創作者名稱
            </li>
            <li>點進貼圖頁，就能看到各國的目前排名和30天走勢圖</li>
            <li>按 ♥ Favorites 收藏，之後每天回來追蹤變化</li>
          </ol>
          <p className="text-xs text-gray-400 mt-2">
            ※收錄範圍是曾進入各國Top 500的貼圖，還沒上過榜的貼圖不會出現在搜尋結果。
          </p>
          <p className="text-sm text-gray-500 mt-3">
            很多創作者想知道LINE貼圖銷售量怎麼看：實際銷售數字只能在LINE Creators Market後台查詢，
            但想知道自己的貼圖在整個市場賣得好不好，看它在Top 500排行榜上的名次和每小時的變化就知道。
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <h2 className="font-bold text-gray-800 text-lg mb-3">常見問題</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <div key={item.q} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-700 text-sm">{item.q}</h3>
                <p className="text-sm text-gray-500 mt-1">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="border-t border-gray-100 mt-12 py-8 text-center text-xs text-gray-400 space-y-1">
          <p>
            <a href="/" className="hover:text-green-600">English</a>
            {' · '}
            <a href="/th" lang="th" className="hover:text-green-600">ภาษาไทย</a>
            {' · '}
            <a href="/ja" lang="ja" className="hover:text-green-600">日本語</a>
            {' · '}
            <a href="/country/tw" className="hover:text-green-600">台灣排行榜</a>
          </p>
          <p className="font-semibold text-gray-500">11tumarai Company</p>
        </footer>
      </div>
      <JsonLd data={PAGE_JSONLD} />
    </div>
  );
}
