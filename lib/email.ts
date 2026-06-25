import nodemailer, { type Transporter } from 'nodemailer';

// Single place that talks to the mail provider. Today it's Gmail SMTP (free, App
// Password auth); swapping to a domain + Resend later means only changing this file.
const FROM = `LineStickerRanking <${process.env.GMAIL_USER ?? 'linestickerranking@gmail.com'}>`;

let _transport: Transporter | null = null;
function transport(): Transporter {
  if (_transport) return _transport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD not set — add them to .env.local and Vercel env');
  }
  _transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return _transport;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transport().sendMail({ from: FROM, to, subject, html });
}

// Absolute base URL for links in emails (verify / unsubscribe). Set APP_URL once a real
// domain exists; falls back to the Vercel URL.
export function appUrl(path = ''): string {
  const base = process.env.APP_URL ?? 'https://line-sticker-ranking.vercel.app';
  return base.replace(/\/$/, '') + path;
}
