import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const root = process.cwd();
const appDir = join(root, 'app');
const publicDir = join(root, 'public');
const siteUrl = 'https://gujaratrelocationpackers.com';
const excludedRoutePrefixes = [
  '/admin', '/admin-history', '/auth', '/book', '/bookings', '/components',
  '/driver', '/explore', '/home-service', '/home-services/available-requests',
  '/home-services/my-requests', '/home-services/request', '/modal', '/notifications',
  '/properties/my-properties', '/properties/post', '/provider', '/refer-and-earn',
  '/ref', '/splash', '/support-chat', '/tracking', '/unauthorized', '/wallet',
];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function routeFor(file) {
  const parts = relative(appDir, file).split(sep);
  if (!file.endsWith('.tsx') || parts.some((part) => part.startsWith('['))) return null;

  const routeParts = parts
    .filter((part) => !part.startsWith('('))
    .map((part) => part.replace(/\.tsx$/, ''))
    .filter((part) => part !== 'index' && !part.startsWith('_'));
  if (parts.at(-1)?.startsWith('_') || parts.at(-1)?.startsWith('+')) return null;
  const route = `/${routeParts.join('/')}`.replace(/\/$/, '') || '/';
  return excludedRoutePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)) ? null : route;
}

const routes = [...new Set(walk(appDir).map(routeFor).filter(Boolean))].sort();
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
  .map((route) => `  <url><loc>${siteUrl}${route === '/' ? '/' : route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${route === '/' || route === '/home' ? '1.0' : '0.7'}</priority></url>`)
  .join('\n')}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
const manifest = {
  name: 'Gujarat Relocation Packers',
  short_name: 'GR Packers',
  start_url: '/',
  display: 'standalone',
  background_color: '#F8FAFC',
  theme_color: '#0B1F3A',
  icons: [{ src: '/favicon.png', sizes: 'any', type: 'image/png' }],
};

mkdirSync(join(publicDir, 'fonts'), { recursive: true });
writeFileSync(join(publicDir, 'robots.txt'), robots);
writeFileSync(join(publicDir, 'sitemap.xml'), sitemap);
writeFileSync(join(publicDir, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of ['times.ttf', 'timesbd.ttf']) {
  const source = join(root, 'assets', 'fonts', file);
  if (existsSync(source)) copyFileSync(source, join(publicDir, 'fonts', file));
}
for (const [sourceName, outputName] of [
  ['favicon.png', 'favicon.png'],
  ['PackersMoversLogo.png', 'og-image.png'],
]) {
  const source = join(root, 'assets', 'images', sourceName);
  if (existsSync(source)) copyFileSync(source, join(publicDir, outputName));
}

console.log(`Generated SEO assets for ${routes.length} public Expo Router routes.`);
