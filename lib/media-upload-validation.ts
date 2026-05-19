import { Platform } from 'react-native';

const JPEG_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']);
const MP4_MIMES = new Set(['video/mp4', 'video/mpeg', 'application/mp4']);

export function isAllowedJpegHint(value: string): boolean {
  const v = String(value ?? '').toLowerCase().trim();
  if (!v) return false;
  if (JPEG_MIMES.has(v)) return true;
  if (
    v.endsWith('.jpg') ||
    v.endsWith('.jpeg') ||
    v.endsWith('.jpe') ||
    v.includes('image/jpeg') ||
    v.includes('image/jpg')
  ) {
    return true;
  }
  // Canvas compression on web outputs data:image/jpeg;...
  if (v.startsWith('data:image/')) {
    return !v.startsWith('data:image/png') && !v.startsWith('data:image/gif') && !v.startsWith('data:image/webp');
  }
  return false;
}

export function isAllowedMp4Hint(value: string): boolean {
  const v = String(value ?? '').toLowerCase().trim();
  if (!v) return false;
  if (MP4_MIMES.has(v)) return true;
  return v.endsWith('.mp4') || v.includes('video/mp4') || v.startsWith('data:video/mp4');
}

async function blobMime(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return String(blob.type ?? '').toLowerCase().trim();
}

/** Validates photo URIs on web (blob:/data:) and native (file paths). */
export async function isAllowedPhotoUri(uri: string, mimeHint?: string): Promise<boolean> {
  const u = String(uri ?? '').trim();
  if (!u) return false;
  if (isAllowedJpegHint(mimeHint ?? '')) return true;
  if (isAllowedJpegHint(u)) return true;

  if (Platform.OS !== 'web') return false;
  if (!u.startsWith('blob:') && !u.startsWith('http://') && !u.startsWith('https://')) return false;

  try {
    const t = await blobMime(u);
    if (!t) return true;
    if (JPEG_MIMES.has(t)) return true;
    // Some browsers report generic image/* or octet-stream for JPEG blobs
    if (t === 'image/*' || t === 'application/octet-stream') return true;
    return false;
  } catch {
    return u.startsWith('blob:') || u.startsWith('data:image/');
  }
}

/** Validates video URIs on web and native. */
export async function isAllowedVideoUri(uri: string, mimeHint?: string): Promise<boolean> {
  const u = String(uri ?? '').trim();
  if (!u) return false;
  if (isAllowedMp4Hint(mimeHint ?? '')) return true;
  if (isAllowedMp4Hint(u)) return true;

  if (Platform.OS !== 'web') return false;
  if (!u.startsWith('blob:') && !u.startsWith('http://') && !u.startsWith('https://')) return false;

  try {
    const t = await blobMime(u);
    if (!t) return true;
    return MP4_MIMES.has(t) || t.includes('mp4');
  } catch {
    return u.startsWith('blob:') || u.startsWith('data:video/');
  }
}
