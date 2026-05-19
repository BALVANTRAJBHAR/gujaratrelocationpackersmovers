import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/** File size in bytes; works on web (blob/data URL) and native (expo-file-system). */
export async function getLocalFileSizeBytes(uri: string): Promise<number | null> {
  const u = String(uri ?? '').trim();
  if (!u) return null;

  if (Platform.OS === 'web') {
    try {
      if (u.startsWith('data:')) {
        const comma = u.indexOf(',');
        const base64 = comma >= 0 ? u.slice(comma + 1) : '';
        if (!base64) return null;
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        return Math.max(0, Math.floor(base64.length * 0.75) - padding);
      }
      const res = await fetch(u);
      const blob = await res.blob();
      return typeof blob.size === 'number' ? blob.size : null;
    } catch {
      return null;
    }
  }

  try {
    const info = await FileSystem.getInfoAsync(u, { size: true } as any);
    return typeof (info as any)?.size === 'number' ? Number((info as any).size) : null;
  } catch {
    return null;
  }
}
