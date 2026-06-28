'use client';

import Script from 'next/script';

// Microsoft Clarity — free heatmaps + session replay. Stays a no-op until
// NEXT_PUBLIC_CLARITY_ID is set, so it's safe to ship before the Clarity account exists.
export default function ClarityAnalytics() {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID;
  if (!id) return null;
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
    </Script>
  );
}
