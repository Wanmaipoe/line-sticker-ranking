// Schema for the follow + email-alert feature (Model 3 free tier).
//   subscribers — one row per email (double opt-in via `verified`)
//   follows     — which sticker/creator each subscriber tracks
// Idempotent. Run once: node scripts/migrate-subscribers.mjs
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

try {
  const env = readFileSync('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) { const k = line.slice(0, i).trim(); if (k && !k.startsWith('#')) process.env[k] = line.slice(i + 1).trim(); }
  }
} catch {}

if (!process.env.TURSO_DATABASE_URL) { console.error('Missing TURSO_DATABASE_URL'); process.exit(1); }

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    verified INTEGER NOT NULL DEFAULT 0,
    token TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(subscriber_id, target_type, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_follows_sub ON follows(subscriber_id);
  CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(token);
`);

console.log('subscribers + follows tables ready');
