import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { unsubscribeByToken } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f5f5f3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.08)">
<div style="font-weight:700;font-size:18px;margin-bottom:16px">LineStickerRanking</div>${body}
<p style="margin-top:24px"><a href="/" style="color:#06c755;text-decoration:none;font-size:14px">Go to site →</a></p></div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } }
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const email = token ? await unsubscribeByToken(getDb(), token) : null;
  if (!email) {
    return page('Link invalid', '<p style="color:#993C1D;font-size:15px">This link is invalid or you\'re already unsubscribed.</p>');
  }
  return page(
    'Unsubscribed',
    '<p style="font-size:28px;margin:0">👋</p><p style="color:#555;font-size:15px;line-height:1.6">You\'ve been unsubscribed. You won\'t get any more rank alerts.</p>'
  );
}
