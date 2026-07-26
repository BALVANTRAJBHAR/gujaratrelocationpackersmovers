import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const siteUrl = 'https://gujaratrelocationpackers.com';
const noIndexPrefixes = ['/admin', '/auth', '/book', '/bookings', '/components', '/driver', '/modal', '/notifications', '/provider', '/ref', '/wallet'];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function routeFor(file) {
  const output = relative(distDir, file).split(sep).join('/').replace(/\.html$/, '');
  return output === 'index' ? '/' : `/${output}`;
}

let processed = 0;
for (const file of walk(distDir).filter((path) => path.endsWith('.html'))) {
  const route = routeFor(file);
  const canonical = `${siteUrl}${route}`;
  const noIndex = noIndexPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/g, '');
  html = html.replace(/<link rel="canonical"[^>]*>/g, '');
  html = html.replace(/<meta property="og:url"[^>]*>/g, '');
  html = html.replace(
    /<meta name="robots" content="[^"]*"\/>/,
    `<meta name="robots" content="${noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}"/>`,
  );
  html = html.replace(
    '</head>',
    `<title>Gujarat Relocation Packers | Packers, Movers, Home Services &amp; Property Management</title><link rel="canonical" href="${canonical}"/><meta property="og:url" content="${canonical}"/></head>`,
  );
  writeFileSync(file, html);
  processed += 1;
}

console.log(`Applied canonical URLs and index rules to ${processed} web pages.`);
