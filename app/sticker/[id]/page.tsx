import { getDb, getLatestRankingsForProduct } from '@/lib/db';
import StickerDetailClient from './StickerDetailClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StickerPage({ params }: Props) {
  const { id } = await params;
  const client = getDb();

  const result = await client.execute({
    sql: 'SELECT * FROM products WHERE id = ?',
    args: [id],
  });

  const row = result.rows[0];
  if (!row) notFound();

  const product = {
    id: row.id as string,
    name: row.name as string,
    image_url: row.image_url as string | null,
  };

  const rankings = await getLatestRankingsForProduct(client, id);

  return (
    <StickerDetailClient
      id={id}
      name={product.name}
      imageUrl={
        product.image_url ??
        `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`
      }
      initialRankings={rankings}
    />
  );
}
