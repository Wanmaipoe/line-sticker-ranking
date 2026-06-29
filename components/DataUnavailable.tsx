// Rendered (HTTP 200) when a page's data can't be read right now — e.g. the database read
// quota is temporarily exhausted. A friendly 200 with a link keeps crawlers from recording
// a 5xx error against the page (which hurts indexing), unlike letting the read throw → 500.
export default function DataUnavailable() {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-20">
      <div className="text-4xl mb-4">📊</div>
      <h1 className="text-lg font-bold text-gray-700 mb-2">Ranking data is updating</h1>
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
        This page is being refreshed and will be back in a few minutes. Thanks for your patience.
      </p>
      <a href="/" className="mt-6 text-sm font-medium text-[#06c755] hover:underline">
        ← Back to LineStickerRanking
      </a>
    </main>
  );
}
