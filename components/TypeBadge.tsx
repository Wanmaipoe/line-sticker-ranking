// Small pill marking a sticker's type (animation / popup / sound). Static packs
// render nothing. Type is read for free from the ranking list icon by the scraper.
const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  animation: { label: '▶ Animated', cls: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300' },
  popup: { label: '⤢ Popup', cls: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  sound: { label: '🔊 Sound', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  popup_sound: { label: '⤢ Popup', cls: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  effect: { label: '✨ Effect', cls: 'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300' },
};

export default function TypeBadge({ type, className }: { type?: string | null; className?: string }) {
  if (!type || type === 'static' || type === 'name') return null;
  const t = TYPE_LABELS[type] ?? { label: type, cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-300' };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded leading-none flex-shrink-0 ${t.cls} ${className ?? ''}`}
    >
      {t.label}
    </span>
  );
}
