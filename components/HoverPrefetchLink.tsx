'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

// <Link> for rows in long lists of on-demand pages (/sticker/[id], /creator/[name]).
//
// A default <Link> prefetches the moment it scrolls into view, and those routes are ISR with
// generateStaticParams() returning [] — so a prefetch whose cache entry is missing or stale makes the
// server RENDER the page, database queries and all. Measured on production: scrolling through
// /country/jp once prefetched 28 sticker pages and 18 creator pages, nearly all of which nobody
// opens, and every deploy empties the ISR cache so the next visitor pays for all of them again.
//
// This waits for intent instead: prefetching switches on when the pointer enters the link or a touch
// starts on it, which still lands before the click. It is the pattern Next's own docs recommend for
// large lists (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
// "Disabling prefetching"). A click on a link that never prefetched is still a normal client-side
// navigation; it just waits for the page instead of having it ready.
export default function HoverPrefetchLink({ onMouseEnter, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(e) => {
        setActive(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setActive(true);
        onTouchStart?.(e);
      }}
    />
  );
}
