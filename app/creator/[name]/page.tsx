import { getDb, getProductsByAuthor, getProductsWithRankings } from '@/lib/db';
import CreatorClient from './CreatorClient';

export const dynamic = 'force-dynamic';

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'];

interface Props {
  params: Promise<{ name: string }>;
}

export default async function CreatorPage({ params }: Props) {
  const { name } = await params;
  const author = decodeURIComponent(name);
  const client = getDb();

  const products = await getProductsByAuthor(client, author);
  const ids = products.map((p) => p.id);
  const rankings = await getProductsWithRankings(client, ids, FEATURED);

  const withRankings = products.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    author: p.author,
    rankings: rankings[p.id] ?? Object.fromEntries(FEATURED.map((cc) => [cc, null])),
  }));

  return <CreatorClient author={author} products={withRankings} />;
}
