'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Microsoft Clarity — free heatmaps + session replay. Stays a no-op until
// NEXT_PUBLIC_CLARITY_ID is set, so it's safe to ship before the Clarity account exists.
//
// Clarity RECORDS THE DOM, so it must never run on /revenue. That page renders real payout
// figures, pack titles and owner names parsed from a CSV we deliberately keep on-device; session
// replay would upload exactly that to Microsoft and quietly break the promise the page makes.
// Client-side parsing alone does not keep data private — whatever gets rendered still leaks.
const BLOCKED = ['/revenue'];

export default function ClarityAnalytics() {
  // Before any early return: hooks must not be conditional.
  const pathname = usePathname();
  const id = process.env.NEXT_PUBLIC_CLARITY_ID;
  if (!id) return null;

  // Returning null only stops Clarity BOOTING on a fresh load of a blocked page. Once the tag is
  // in the document it keeps recording across client-side navigation, and unmounting this
  // component does not remove it. That's why the header's entry point is a plain <a> (full
  // document load) rather than <Link> — see HomeClient's revenueLink. Both halves are load-bearing:
  // this one covers direct hits and reloads, the full load covers navigation from another page.
  if (BLOCKED.some((p) => pathname === p || pathname?.startsWith(`${p}/`))) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
    </Script>
  );
}
