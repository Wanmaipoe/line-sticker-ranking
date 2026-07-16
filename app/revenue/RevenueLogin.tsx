'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RevenueLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/revenue/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword('');
        router.refresh(); // the server component re-runs and now sees a valid cookie
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not sign in');
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-green-600 hover:underline">
          ← Back to rankings
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
          <div className="text-center">
            <div className="text-3xl">🔒</div>
            <h1 className="text-lg font-bold text-gray-800 mt-2">Revenue distribution</h1>
            <p className="text-xs text-gray-400 mt-1">Team only. Enter the shared password.</p>
          </div>

          {!configured ? (
            <p className="mt-5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              This tool has no password set yet. Add <code className="font-mono">REVENUE_PASSWORD</code> to the
              Vercel project environment variables and redeploy.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm transition-colors bg-white text-gray-900 placeholder:text-gray-400"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={busy || !password}
                className="w-full px-4 py-2.5 bg-[#06c755] text-white rounded-xl text-sm font-medium hover:bg-[#05b04a] transition-colors disabled:opacity-50"
              >
                {busy ? 'Checking...' : 'Unlock'}
              </button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-gray-400 mt-4 text-center leading-relaxed">
          Revenue files you upload are read inside your browser only. They are never sent to this
          site&apos;s servers or saved to its database.
        </p>
      </div>
    </div>
  );
}
