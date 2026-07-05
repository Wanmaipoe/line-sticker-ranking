export default function Footer() {
  return (
    <footer className="border-t border-gray-100 mt-12 py-8 text-center text-xs text-gray-400 space-y-1">
      <p className="font-semibold text-gray-500">11tumarai Company</p>
      <p>
        Company email:{' '}
        <a href="mailto:linestickerranking@gmail.com" className="hover:text-green-600">
          linestickerranking@gmail.com
        </a>
      </p>
      <p>Dev by: PorTowelMan</p>
      <p>Team : NumfarangIpluem, CEO Parn, WKAmbitious, KingMom</p>
      <p className="pt-1">
        <a href="/th" lang="th" className="hover:text-green-600">ภาษาไทย</a>
        {' · '}
        <a href="/ja" lang="ja" className="hover:text-green-600">日本語</a>
        {' · '}
        <a href="/zh-hant" lang="zh-Hant" className="hover:text-green-600">繁體中文</a>
      </p>
    </footer>
  );
}
