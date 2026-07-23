/**
 * Adds the character-classification columns to products:
 *   character_type    cat | dog | rabbit | bear | bird | hamster | panda | human | food | other
 *   character_source  ai | manual   (manual = an admin correction; the classifier must NOT overwrite it)
 *
 * NULL character_type = not yet classified. The daily classifier (scripts/classify-characters.mjs)
 * fills NULLs via Cloudflare Moondream; admin edits set source='manual' so re-runs skip them.
 *
 * Idempotent: skips columns that already exist. Run once:  node scripts/migrate-add-character.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Load .env.local for local runs (in CI the env is already set).
try {
  const env = readFileSync('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !key.startsWith('#')) process.env[key] = val;
    }
  }
} catch {}

if (!process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: Missing TURSO_DATABASE_URL in .env.local');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const columns = [
  ['character_type', 'TEXT'],
  ['character_source', 'TEXT'],
];

for (const [name, type] of columns) {
  try {
    await client.execute(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
    console.log(`added column: ${name}`);
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log(`column already exists: ${name}`);
    } else {
      throw err;
    }
  }
}

// Partial-ish index to make "unclassified in the current ranking" lookups cheap for the classifier
// and to keep the /characters grouping read index-friendly.
await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_character ON products(character_type)`);
console.log('migration done');
