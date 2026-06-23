import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'data', 'rankings.db'));

const dates = db.prepare(`
  SELECT DISTINCT snapshot_date FROM rankings WHERE country = 'us' ORDER BY snapshot_date DESC LIMIT 5
`).all();

console.log('US dates in DB:', dates.map(d => d.snapshot_date));

const count = db.prepare(`SELECT COUNT(*) as n FROM rankings WHERE country = 'us'`).get();
console.log('Total US rows:', count.n);
