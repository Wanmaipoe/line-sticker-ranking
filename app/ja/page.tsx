import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

// Japanese landing page targeting native queries ("LINEスタンプ ランキング",
// "LINEスタンプ 人気ランキング", "LINEスタンプ ランキング 自分", "順位 検索").
// Fully static: no DB access, prerendered at build, zero Turso reads.
// Positioning: JP already has a domestic tracker (linestamp.userlocal.jp), so the copy
// leads with what it lacks — 5-country comparison (how JP stickers sell overseas).
// hreflang cluster member — the alternates.languages map below must stay identical to the
// maps in app/layout.tsx, app/th/page.tsx and app/zh-hant/page.tsx.

const TITLE_JA = 'LINEスタンプ人気ランキング｜毎時更新・5カ国対応';
const DESC_JA =
  'LINEスタンプの人気ランキングTop500を毎時間自動更新。過去30日の順位グラフ、クリエイターランキング、日本・タイ・台湾・インドネシア・米国の5カ国比較に対応。自分のスタンプの順位検索も無料。';

export const metadata: Metadata = {
  title: TITLE_JA,
  description: DESC_JA,
  alternates: {
    canonical: '/ja',
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
    title: TITLE_JA,
    description: DESC_JA,
    url: `${SITE_URL}/ja`,
    locale: 'ja_JP',
  },
};

const PAGE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE_JA,
  description: DESC_JA,
  url: `${SITE_URL}/ja`,
  inLanguage: 'ja',
  isPartOf: { '@type': 'WebSite', name: 'LineStickerRanking', url: SITE_URL },
};

const FEATURES = [
  {
    icon: '⏱',
    title: '毎時更新',
    body: 'LINE STOREのランキングを毎時間記録。週間・月間まとめを待つ必要はありません。',
  },
  {
    icon: '📈',
    title: '30日間の順位グラフ',
    body: 'スタンプをクリックすると、過去30日間の順位の推移がグラフで見られます。いつ上がって、いつ下がったかが一目瞭然。',
  },
  {
    icon: '🌏',
    title: '5カ国を横断比較',
    body: '日本・タイ・台湾・インドネシア・米国のランキングを一つのサイトで。日本のスタンプが海外でどれだけ人気があるかも分かります。',
  },
  {
    icon: '🏅',
    title: 'クリエイターランキング',
    body: 'Top100に最も多くのスタンプをランクインさせているクリエイターは誰か。日本・タイ・台湾のデータを毎時間集計。',
  },
];

const FAQ = [
  {
    q: 'ランキングのデータはどこから来ていますか？',
    a: 'LINE STORE（store.line.me）のクリエイターズスタンプ人気ランキングページから、1時間に1回、各国分を取得しています。',
  },
  {
    q: 'LINE STOREのランキングと何が違いますか？',
    a: 'LINE STOREで見られるのは「今の順位」だけですが、このサイトは過去30日分の履歴を保存しているので、順位の推移がグラフで分かります。さらに5カ国のランキングを横断して比較できます。',
  },
  {
    q: '無料で使えますか？',
    a: 'すべて無料です。登録も不要で、そのまま見られます。',
  },
];

export default function JapaneseLandingPage() {
  return (
    // The root layout is lang="en"; this wrapper re-declares Japanese for this page's
    // content (screen readers + non-Google engines — Google detects language from the text).
    <div lang="ja" className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-800 text-lg">LineStickerRanking</span>
          <a href="/" className="text-sm text-green-600 hover:underline">English</a>
        </div>

        {/* Hero */}
        <div className="text-center mt-10 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            LINEスタンプ ランキング（毎時更新）
          </h1>
          <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
            LINE STOREのクリエイターズスタンプ上位500位を毎時間記録。過去30日間の順位グラフ付き。
            日本だけでなく、タイ・台湾・インドネシア・米国のランキングも見られます。
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <a
              href="/country/jp"
              className="bg-green-600 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-green-700 transition-colors"
            >
              🇯🇵 日本のランキングを見る
            </a>
            <a
              href="/creators"
              className="bg-white text-green-600 border border-green-200 font-medium px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors"
            >
              🏅 クリエイターランキング
            </a>
            <a
              href="/"
              className="bg-white text-gray-600 border border-gray-200 font-medium px-5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              🌏 全5カ国を見る
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

        {/* Creator how-to — targets "ランキング 自分" / "順位 検索" intent */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 mt-8">
          <h2 className="font-bold text-gray-800 text-lg">自分のスタンプの順位を検索する</h2>
          <p className="text-sm text-gray-500 mt-2">
            LINE Creators Marketでスタンプを販売しているクリエイターの方は、
            自分のスタンプが今チャートのどこにいるか、次の手順で確認できます。
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 mt-3 space-y-1.5">
            <li>
              <a href="/" className="text-green-600 hover:underline">トップページ</a>
              の検索ボックスに、スタンプ名またはクリエイター名を入力
            </li>
            <li>スタンプをクリックすると、各国の現在順位と30日間の順位グラフが表示されます</li>
            <li>お気に入り（♥ Favorites）に保存しておけば、毎日の変動を追いかけられます</li>
          </ol>
          <p className="text-xs text-gray-400 mt-2">
            ※対象は各国のTop500にランクインしたことのあるスタンプです。まだ圏外のスタンプは検索結果に表示されません。
          </p>
          <p className="text-sm text-gray-500 mt-3">
            販売数の確認はLINE Creators Marketのマイページでしかできませんが、
            市場全体の中での立ち位置は、Top500チャート上の順位と毎時の変動から読み取れます。
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <h2 className="font-bold text-gray-800 text-lg mb-3">よくある質問</h2>
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
            <a href="/zh-hant" lang="zh-Hant" className="hover:text-green-600">繁體中文</a>
            {' · '}
            <a href="/country/jp" className="hover:text-green-600">日本のランキング</a>
          </p>
          <p className="font-semibold text-gray-500">11tumarai Company</p>
        </footer>
      </div>
      <JsonLd data={PAGE_JSONLD} />
    </div>
  );
}
