import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'data', 'rankings.db'));

const rows = db.prepare(`
  SELECT r.country, r.rank, p.name
  FROM rankings r
  JOIN products p ON p.id = r.product_id
  WHERE r.snapshot_date = '2026-06-23' AND r.rank <= 3
  ORDER BY r.country, r.rank
`).all();

rows.forEach(r => console.log(r.country, '#' + r.rank, r.name.slice(0, 40)));
db.close();
