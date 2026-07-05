import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

// Thai landing page targeting native-language queries ("อันดับสติกเกอร์ไลน์",
// "สติกเกอร์ไลน์ขายดีที่สุด", "เช็คอันดับสติกเกอร์ของตัวเอง"). Fully static: no DB access,
// prerendered at build, zero Turso reads no matter how often it gets crawled.
// This page + the root form the hreflang cluster (see alternates.languages here and in
// app/layout.tsx — the two maps must stay identical or Google ignores the cluster).

const TITLE_TH = 'อันดับสติกเกอร์ไลน์วันนี้ Top 500 อัปเดตทุกชั่วโมง';
const DESC_TH =
  'ดูอันดับสติกเกอร์ไลน์ขายดี ครบ 500 อันดับ อัปเดตทุกชั่วโมงจาก LINE Store เช็คอันดับสติกเกอร์ของตัวเองได้ฟรี พร้อมกราฟย้อนหลัง 30 วัน ครบ 5 ประเทศ';

export const metadata: Metadata = {
  title: TITLE_TH,
  description: DESC_TH,
  alternates: {
    canonical: '/th',
    languages: {
      en: '/',
      th: '/th',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    title: TITLE_TH,
    description: DESC_TH,
    url: `${SITE_URL}/th`,
    locale: 'th_TH',
  },
};

const PAGE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE_TH,
  description: DESC_TH,
  url: `${SITE_URL}/th`,
  inLanguage: 'th',
  isPartOf: { '@type': 'WebSite', name: 'LineStickerRanking', url: SITE_URL },
};

const FEATURES = [
  {
    icon: '⏱',
    title: 'อัปเดตทุกชั่วโมง',
    body: 'เก็บอันดับจาก LINE Store ทุกชั่วโมง ไม่ต้องรอสรุปรายสัปดาห์หรือรายเดือน',
  },
  {
    icon: '📈',
    title: 'กราฟย้อนหลัง 30 วัน',
    body: 'คลิกสติกเกอร์ตัวไหนก็ได้เพื่อดูเส้นทางอันดับ ขึ้นเมื่อไหร่ ตกเมื่อไหร่ เห็นครบทั้งเดือน',
  },
  {
    icon: '🌏',
    title: '5 ประเทศในที่เดียว',
    body: 'เทียบอันดับข้ามประเทศได้ทันที ไทย ญี่ปุ่น ไต้หวัน อินโดนีเซีย และสหรัฐฯ',
  },
  {
    icon: '🏅',
    title: 'อันดับครีเอเตอร์',
    body: 'ดูว่าครีเอเตอร์คนไหนมีสติกเกอร์ติด Top 100 มากที่สุด ในญี่ปุ่น ไทย และไต้หวัน อัปเดตทุกชั่วโมง',
  },
];

const FAQ = [
  {
    q: 'ข้อมูลอันดับมาจากไหน',
    a: 'เก็บจากหน้า Top Creators ของ LINE Store (store.line.me) โดยตรง ชั่วโมงละครั้ง ทุกประเทศ',
  },
  {
    q: 'ต่างจากดูอันดับใน LINE Store ยังไง',
    a: 'LINE Store โชว์เฉพาะอันดับ ณ ตอนนี้ แต่ที่นี่เก็บประวัติให้ย้อนหลัง 30 วัน เห็นทั้งขาขึ้นขาลง และเทียบหลายประเทศพร้อมกันได้ในหน้าเดียว',
  },
  {
    q: 'อยากดูแค่ 10 อันดับแรกของวันนี้ ดูตรงไหน',
    a: 'เปิดหน้าอันดับประเทศไทยได้เลย 10 อันดับสติกเกอร์ไลน์ขายดีที่สุดจะอยู่บนสุดของตาราง อัปเดตทุกชั่วโมง',
  },
  {
    q: 'ใช้ฟรีไหม',
    a: 'ฟรีทั้งหมด ไม่ต้องสมัครสมาชิก เปิดดูได้เลย',
  },
];

export default function ThaiLandingPage() {
  return (
    // The root layout is lang="en"; this wrapper re-declares Thai for this page's content
    // (screen readers + non-Google engines — Google itself detects language from the text).
    <div lang="th" className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-800 text-lg">LineStickerRanking</span>
          <a href="/" className="text-sm text-green-600 hover:underline">English</a>
        </div>

        {/* Hero */}
        <div className="text-center mt-10 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            อันดับสติกเกอร์ไลน์ อัปเดตทุกชั่วโมง
          </h1>
          <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
            ดูสติกเกอร์ไลน์ขายดี Top 500 จากหน้า Top Creators ของ LINE Store
            พร้อมกราฟอันดับย้อนหลัง 30 วัน ครอบคลุม 5 ประเทศ ไทย ญี่ปุ่น ไต้หวัน อินโดนีเซีย และสหรัฐฯ
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <a
              href="/country/th"
              className="bg-green-600 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-green-700 transition-colors"
            >
              🇹🇭 ดูอันดับประเทศไทย
            </a>
            <a
              href="/creators"
              className="bg-white text-green-600 border border-green-200 font-medium px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors"
            >
              🏅 อันดับครีเอเตอร์
            </a>
            <a
              href="/"
              className="bg-white text-gray-600 border border-gray-200 font-medium px-5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              🌏 ดูครบทุกประเทศ
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

        {/* Creator how-to — targets "เช็คอันดับ/ยอดขายสติกเกอร์ของตัวเอง" intent */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 mt-8">
          <h2 className="font-bold text-gray-800 text-lg">เช็คอันดับสติกเกอร์ของตัวเอง</h2>
          <p className="text-sm text-gray-500 mt-2">
            ถ้าคุณเป็นครีเอเตอร์ที่ขายสติกเกอร์ใน LINE Creators Market
            แล้วอยากรู้ว่าเซ็ตของตัวเองไปอยู่ตรงไหนของชาร์ต ทำแบบนี้ได้เลย
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 mt-3 space-y-1.5">
            <li>
              ไปที่<a href="/" className="text-green-600 hover:underline">หน้าหลัก</a>{' '}
              แล้วพิมพ์ชื่อสติกเกอร์ หรือชื่อครีเอเตอร์ของคุณในช่องค้นหา
            </li>
            <li>คลิกที่สติกเกอร์ เพื่อดูอันดับปัจจุบันของแต่ละประเทศ พร้อมกราฟย้อนหลัง 30 วัน</li>
            <li>กด ♥ Favorites เก็บไว้ แล้วกลับมาตามดูความเคลื่อนไหวได้ทุกวัน</li>
          </ol>
          <p className="text-sm text-gray-500 mt-3">
            หลายคนค้นหาวิธีเช็คยอดขายสติกเกอร์ไลน์ ตัวเลขยอดขายจริงดูได้ใน LINE Creators Market
            ของคุณเองเท่านั้น ส่วนเว็บนี้ช่วยให้เห็นว่าสติกเกอร์ของคุณขายดีแค่ไหนเมื่อเทียบกับทั้งตลาด
            ผ่านอันดับบนชาร์ต Top 500 ที่ขยับทุกชั่วโมง
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <h2 className="font-bold text-gray-800 text-lg mb-3">คำถามที่พบบ่อย</h2>
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
            <a href="/" className="hover:text-green-600">English version</a>
            {' · '}
            <a href="/country/th" className="hover:text-green-600">อันดับประเทศไทย</a>
            {' · '}
            <a href="/creators" className="hover:text-green-600">อันดับครีเอเตอร์</a>
          </p>
          <p className="font-semibold text-gray-500">11tumarai Company</p>
        </footer>
      </div>
      <JsonLd data={PAGE_JSONLD} />
    </div>
  );
}
