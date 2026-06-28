import nodemailer, { type Transporter } from 'nodemailer';
import { SITE_URL } from './seo';

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

// Absolute base URL for links in emails (verify / unsubscribe). Reuses SITE_URL so the
// email origin can never drift from the canonical site origin used for SEO.
export function appUrl(path = ''): string {
  return SITE_URL + path;
}
