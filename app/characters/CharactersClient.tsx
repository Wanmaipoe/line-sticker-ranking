'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP } from '@/lib/countries';
import { CHARACTER_CATEGORIES, CHARACTER_MAP } from '@/lib/characters';
import type { CountryCharacterData, CharacterRankItem } from '@/lib/db';

// A character needs at least this many packs across the three markets combined to earn a tab.
const MIN_TOTAL_FOR_TAB = 3;
// A column shows this many packs, then a "View all" toggle reveals the rest (already loaded).
const INITIAL_VISIBLE = 50;

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500';
  if (rank <= 3) return 'text-orange-400';
  if (rank <= 10) return 'text-green-600';
  return 'text-gray-400';
}

// Move a sticker to a new character in every country's data (a manual edit is a global product
// change), optimistically, so the UI updates without a re-fetch.
function applyEdit(
  data: CountryCharacterData[],
  id: string,
  newKey: string
): CountryCharacterData[] {
  return data.map((d) => {
    let found: CharacterRankItem | null = null;
    const byCharacter: Record<string, CharacterRankItem[]> = {};
    for (const [k, list] of Object.entries(d.byCharacter)) {
      const kept: CharacterRankItem[] = [];
      for (const it of list) {
        if (it.id === id) found = it;
        else kept.push(it);
      }
      byCharacter[k] = kept;
    }
    if (!found) return d; // not ranked in this country
    const moved: CharacterRankItem = { ...found, character: newKey, source: 'manual' };
    byCharacter[newKey] = [...(byCharacter[newKey] ?? []), moved].sort((a, b) => a.rank - b.rank);
    const counts: Record<string, number> = {};
    for (const [k, list] of Object.entries(byCharacter)) counts[k] = list.length;
    return { ...d, byCharacter, counts };
  });
}

function CharacterColumn({
  data,
  characterKey,
  adminMode,
  onEdit,
}: {
  data: CountryCharacterData;
  characterKey: string;
  adminMode: boolean;
  onEdit: (id: string, country: string, newKey: string) => void;
}) {
  const info = COUNTRY_MAP[data.country];
  const items: CharacterRankItem[] = data.byCharacter[characterKey] ?? [];
  const total = data.counts[characterKey] ?? 0;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="font-bold text-gray-700 text-sm">
          {info?.flag} {info?.name ?? data.country.toUpperCase()}
        </span>
        <span className="text-[11px] text-gray-400">{total} in top 500</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-8 text-center">
          None in {info?.name ?? data.country.toUpperCase()}&apos;s current top 500.
        </p>
      ) : (
        <ol className="divide-y divide-gray-50">
          {visible.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-green-50/60 transition-colors">
              <a href={`/sticker/${it.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                <span className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
                  <Image
                    src={it.image_url ?? `https://stickershop.line-scdn.net/stickershop/v1/product/${it.id}/LINEStorePC/main.png`}
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                    className="object-contain w-full h-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-700 truncate">{it.name}</span>
                  {it.author && <span className="block text-[11px] text-gray-400 truncate">{it.author}</span>}
                </span>
              </a>

              {adminMode ? (
                <select
                  value={it.character}
                  onChange={(e) => onEdit(it.id, data.country, e.target.value)}
                  title={it.source === 'manual' ? 'Set manually' : 'Auto-detected — change to correct it'}
                  className="text-[11px] border border-gray-200 rounded-md py-1 pl-1.5 pr-5 bg-white text-gray-600 flex-shrink-0 focus:border-[#06c755] focus:outline-none"
                >
                  {CHARACTER_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`text-[11px] font-medium flex-shrink-0 ${rankClass(it.rank)}`}>#{it.rank} overall</span>
              )}

              {it.source === 'manual' && (
                <span className="text-[11px] text-green-500 flex-shrink-0" title="Set by hand">✎</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {items.length > INITIAL_VISIBLE && (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full text-xs font-medium text-green-600 hover:bg-green-50 py-2.5 border-t border-gray-50 transition-colors"
        >
          {expanded ? '↑ Show less' : `↓ View all ${items.length}`}
        </button>
      )}
    </div>
  );
}

export default function CharactersClient({ data: initialData }: { data: CountryCharacterData[] }) {
  const [data, setData] = useState<CountryCharacterData[]>(initialData);
  const [refreshing, setRefreshing] = useState(false);

  // Admin edit mode. We do NOT check admin status on mount — that would cost every visitor a
  // request. The check only fires when someone clicks the "Admin" affordance.
  const [adminMode, setAdminMode] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [pw, setPw] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/characters');
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length) setData(json.data);
    } catch {
      // keep current data on failure
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleAdmin() {
    if (adminMode) { setAdminMode(false); return; }
    // Already have a valid cookie? enable straight away; else show the password form.
    try {
      const res = await fetch('/api/admin/session');
      const json = await res.json().catch(() => ({}));
      if (json.authed) { setAdminMode(true); return; }
    } catch {}
    setShowLogin(true);
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginBusy || !pw) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        setPw('');
        setShowLogin(false);
        setAdminMode(true);
        return;
      }
      const j = await res.json().catch(() => ({}));
      setLoginError(j.error ?? 'Could not sign in');
    } catch {
      setLoginError('Network error');
    } finally {
      setLoginBusy(false);
    }
  }

  async function editCharacter(id: string, _country: string, newKey: string) {
    setData((d) => applyEdit(d, id, newKey)); // optimistic — snappy for the common (success) path
    try {
      const res = await fetch('/api/admin/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, character: newKey }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Re-sync from the DB rather than restoring a whole-dataset snapshot: a snapshot revert would
      // also wipe any OTHER edit made or Refresh done while this request was in flight. Re-fetching
      // yields the authoritative state (which already includes every edit that did persist and
      // excludes this failed one). refresh() has its own in-flight guard.
      alert('Could not save that change — re-syncing. Are you still signed in?');
      refresh();
    }
  }

  const latestDate = useMemo(() => data.find((d) => d.date)?.date ?? null, [data]);

  const available = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) {
      for (const [ch, n] of Object.entries(d.counts)) {
        totals.set(ch, (totals.get(ch) ?? 0) + n);
      }
    }
    return CHARACTER_CATEGORIES.filter((c) => (totals.get(c.key) ?? 0) >= MIN_TOTAL_FOR_TAB).map((c) => ({
      ...c,
      total: totals.get(c.key) ?? 0,
    }));
  }, [data]);

  const [selected, setSelected] = useState<string>(
    () => available.find((c) => c.key === 'cat')?.key ?? available[0]?.key ?? 'cat'
  );
  const effective = available.some((c) => c.key === selected) ? selected : available[0]?.key ?? selected;

  if (!data.length || !available.length) {
    return (
      <p className="mt-6 text-sm text-gray-400 bg-white border border-gray-100 rounded-2xl px-4 py-10 text-center">
        No character data yet. It fills in as the daily classifier labels the current rankings.
      </p>
    );
  }

  const cat = CHARACTER_MAP[effective];

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {available.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelected(c.key)}
              aria-pressed={effective === c.key}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                effective === c.key
                  ? 'bg-[#06c755] text-white border-[#06c755]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden>{c.emoji}</span> {c.label}
              <span className={effective === c.key ? 'text-green-100' : 'text-gray-400'}>{c.total}</span>
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Fetch the latest rankings now"
          className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {refreshing ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {cat && <p className="text-xs text-gray-400 mt-2">{cat.blurb}</p>}

      {adminMode && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mt-3">
          Admin edit mode on — use the dropdown on any row to correct its character. Corrections are
          saved instantly and won&apos;t be overwritten by the daily auto-detection.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {data.map((d) => (
          <CharacterColumn
            key={`${d.country}-${effective}`}
            data={d}
            characterKey={effective}
            adminMode={adminMode}
            onEdit={editCharacter}
          />
        ))}
      </div>

      {latestDate && (
        <p className="text-xs text-gray-400 mt-4">
          Ranked by each pack&apos;s overall position in its market&apos;s top 500. Characters are
          auto-detected from the pack art and refined by hand where needed.
        </p>
      )}

      {/* Admin affordance — subtle, at the bottom. Normal visitors never trigger the session check. */}
      <div className="mt-6 text-center">
        {showLogin ? (
          <form onSubmit={submitLogin} className="inline-flex items-center gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Admin password"
              autoFocus
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-[#06c755] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loginBusy || !pw}
              className="text-xs bg-[#06c755] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {loginBusy ? '…' : 'Unlock'}
            </button>
            <button type="button" onClick={() => { setShowLogin(false); setLoginError(null); }} className="text-xs text-gray-400">
              Cancel
            </button>
            {loginError && <span className="text-xs text-red-500">{loginError}</span>}
          </form>
        ) : (
          <button
            onClick={toggleAdmin}
            className="text-[11px] text-gray-300 hover:text-gray-500 transition-colors"
          >
            {adminMode ? '✓ Admin mode — click to exit' : '🔒 Admin'}
          </button>
        )}
      </div>
    </div>
  );
}
