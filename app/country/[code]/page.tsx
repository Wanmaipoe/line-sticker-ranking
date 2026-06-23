import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';
import CountryClient from './CountryClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function CountryPage({ params }: Props) {
  const { code } = await params;
  const cc = code.toLowerCase();
  const client = getDb();

  const dateRes = await client.execute({
    sql: `SELECT MAX(snapshot_date) AS latest FROM rankings WHERE country = ?`,
    args: [cc],
  });
  const latestDate = dateRes.rows[0]?.latest as string | null;

  let items: { rank: number; id: string; name: string; image_url: string | null; author: string | null }[] = [];

  if (latestDate) {
    const result = await client.execute({
      sql: `SELECT r.rank, p.id, p.name, p.image_url, p.author
            FROM rankings r
            JOIN products p ON p.id = r.product_id
            WHERE r.country = ? AND r.snapshot_date = ?
            ORDER BY r.rank ASC
            LIMIT 50`,
      args: [cc, latestDate],
    });
    items = result.rows.map((row) => ({
      rank: row.rank as number,
      id: row.id as string,
      name: row.name as string,
      image_url: row.image_url as string | null,
      author: row.author as string | null,
    }));
  }

  const info = COUNTRY_MAP[cc];

  return (
    <CountryClient
      code={cc}
      name={info?.name ?? cc.toUpperCase()}
      flag={info?.flag ?? '🌏'}
      date={latestDate}
      items={items}
    />
  );
}
