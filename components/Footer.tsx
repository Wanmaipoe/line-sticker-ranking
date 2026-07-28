import AdsToggle from '@/components/AdsToggle';

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 mt-12 py-8 text-center text-xs text-gray-400 dark:text-gray-500 space-y-1">
      <p className="pb-1">
        <a href="/about" className="hover:text-green-600 dark:hover:text-green-400">About &amp; methodology</a>
        {' · '}
        <a href="/creators" className="hover:text-green-600 dark:hover:text-green-400">Top creators</a>
      </p>
      <p className="font-semibold text-gray-500 dark:text-gray-400">11tumarai Company</p>
      <p>
        Company email:{' '}
        <a href="mailto:linestickerranking@gmail.com" className="hover:text-green-600 dark:hover:text-green-400">
          linestickerranking@gmail.com
        </a>
      </p>
      <p>Dev by: PorTowelMan</p>
      <p>Team : NumfarangIpluem, CEO Parn, WKAmbitious, KingMom</p>
      <p className="pt-1">
        <a href="/th" lang="th" className="hover:text-green-600 dark:hover:text-green-400">ภาษาไทย</a>
        {' · '}
        <a href="/ja" lang="ja" className="hover:text-green-600 dark:hover:text-green-400">日本語</a>
        {' · '}
        <a href="/zh-hant" lang="zh-Hant" className="hover:text-green-600 dark:hover:text-green-400">繁體中文</a>
      </p>
      <p className="pt-2">
        <AdsToggle />
      </p>
    </footer>
  );
}
