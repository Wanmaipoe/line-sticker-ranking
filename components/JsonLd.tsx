// Renders a JSON-LD structured-data block. Server component; inline it inside any page.
// The `<` escape stops a sticker/creator name containing "</script>" from breaking out.
type Json = Record<string, unknown>;

export default function JsonLd({ data }: { data: Json | Json[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
