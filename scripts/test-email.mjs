// Sanity check after you add GMAIL_USER + GMAIL_APP_PASSWORD to .env.local.
// Usage: node scripts/test-email.mjs you@example.com
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';

try {
  const env = readFileSync('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) { const k = line.slice(0, i).trim(); if (k && !k.startsWith('#')) process.env[k] = line.slice(i + 1).trim(); }
  }
} catch {}

const to = process.argv[2];
if (!to) { console.error('usage: node scripts/test-email.mjs you@example.com'); process.exit(1); }

const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
if (!user || !pass) { console.error('GMAIL_USER / GMAIL_APP_PASSWORD missing in .env.local'); process.exit(1); }

const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
await t.sendMail({
  from: `LineStickerRanking <${user}>`,
  to,
  subject: '✅ LineStickerRanking email works',
  html: '<div style="font-family:sans-serif"><h2>It works 🎉</h2><p>Your alert email system can send. You can now wire up the follow + alert feature.</p></div>',
});
console.log(`sent test email to ${to} (check inbox/spam)`);
