'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'following' | 'error';

export default function AlertSignup({ stickerId }: { stickerId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');

  async function submit() {
    if (!email.trim()) return;
    setStatus('sending');
    setErr('');
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), stickerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErr(data.error ?? 'Something went wrong');
        return;
      }
      setStatus(data.status === 'already_following' ? 'following' : 'sent');
    } catch {
      setStatus('error');
      setErr('Network error — try again');
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
        📧 Almost there — check your inbox and click the confirm link to start getting alerts.
      </div>
    );
  }
  if (status === 'following') {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
        ✓ You&apos;re now tracking this sticker. We&apos;ll email you when it moves rank.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-4 py-2.5 transition-colors w-full sm:w-auto"
      >
        🔔 Get rank alerts
      </button>
    );
  }

  return (
    <div className="bg-green-50/60 border border-green-100 rounded-xl px-4 py-3">
      <p className="text-sm text-gray-600 mb-2">Made this sticker? Get an email when it moves rank.</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="you@email.com"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 focus:border-green-500 focus:outline-none text-sm"
        />
        <button
          onClick={submit}
          disabled={status === 'sending'}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium flex-shrink-0 transition-colors disabled:opacity-50"
        >
          {status === 'sending' ? '...' : 'Notify me'}
        </button>
      </div>
      {status === 'error' && <p className="text-red-500 text-xs mt-1.5">{err}</p>}
      <p className="text-[11px] text-gray-400 mt-1.5">Free. One confirmation email, then alerts only when something notable happens. Unsubscribe anytime.</p>
    </div>
  );
}
