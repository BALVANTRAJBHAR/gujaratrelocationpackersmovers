import { PropsWithChildren } from 'react';

import { LOCAL_BUSINESS_SCHEMA, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from '@/constants/seo';

/** Static HTML shell for the web export. Expo Router never loads this file on mobile. */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en-IN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{SITE_NAME} | Packers, Movers, Home Services & Property Management</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="keywords" content={SITE_KEYWORDS} />
        <meta name="author" content={SITE_NAME} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="theme-color" content="#0B1F3A" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preload" href="/fonts/times.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/timesbd.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <meta property="og:title" content={`${SITE_NAME} | Packers, Movers, Home Services & Property Management`} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content={`${SITE_URL}/og-image.png`} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${SITE_NAME} | Packers, Movers, Home Services & Property Management`} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content={`${SITE_URL}/og-image.png`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_SCHEMA) }} />
        <style id="expo-reset">{'#root,body,html{height:100%}body{overflow:hidden}#root{display:flex}'}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
