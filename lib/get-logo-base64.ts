import { LOGO_DATA_URI } from '@/lib/logo-base64';

let cachedLogoDataUri = '';

/**
 * Returns an inline base64 data URI for the company logo.
 * Uses a bundled constant so PDF generation works reliably on web and mobile
 * (expo-print / WKWebView cannot load local asset:// or file:// image URLs).
 */
export async function getLogoBase64(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  cachedLogoDataUri = LOGO_DATA_URI;
  return cachedLogoDataUri;
}

/** @deprecated Use getLogoBase64 */
export async function getLogoSrcForPdf(): Promise<string> {
  return getLogoBase64();
}
