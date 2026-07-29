const qrCache = new Map<string, string>();

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fetches a QR code and returns an inline data URI so PDF renderers do not need network access. */
export async function getQrDataUri(data: string, size = 140): Promise<string> {
  const key = `${size}:${data}`;
  const cached = qrCache.get(key);
  if (cached) return cached;

  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const dataUri = await blobToDataUri(await response.blob());
    qrCache.set(key, dataUri);
    return dataUri;
  } catch (e) {
    console.warn('[getQrDataUri] Failed to fetch QR code:', e);
    return '';
  }
}
