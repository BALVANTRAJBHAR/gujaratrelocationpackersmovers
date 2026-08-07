/**
 * lib/load-google-maps.ts
 * -----------------------
 * Loads the Google Maps JavaScript API once per API key and resolves with
 * the `google.maps` namespace. Browser-only — native screens use
 * react-native-maps or the WebView variants instead.
 */

declare global {
  interface Window {
    google?: any;
  }
}

let scriptPromise: Promise<any> | null = null;

export function loadGoogleMaps(apiKey: string, libraries: string[] = []): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps API is only available in the browser'));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);

  scriptPromise =
    scriptPromise ??
    new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-key]') as HTMLScriptElement | null;
      if (existing) {
        const waitForMaps = () =>
          window.google?.maps ? resolve(window.google.maps) : window.setTimeout(waitForMaps, 50);
        waitForMaps();
        return;
      }
      const script = document.createElement('script');
      const librariesParam = libraries.length ? `&libraries=${libraries.join(',')}` : '';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}${librariesParam}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsKey = apiKey;
      script.onload = () => resolve(window.google?.maps);
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load the Google Maps JavaScript API'));
      };
      document.head.appendChild(script);
    });

  return scriptPromise;
}
