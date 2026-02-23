import { Audio } from 'expo-av';

const soundCache: Record<string, Audio.Sound> = {};

async function loadSound(asset: number) {
  const sound = new Audio.Sound();
  await sound.loadAsync(asset);
  return sound;
}

export async function playSound(asset: number) {
  if (!soundCache[asset]) {
    soundCache[asset] = await loadSound(asset);
  }
  const sound = soundCache[asset];
  await sound.replayAsync();
}

export function unloadSounds() {
  Object.values(soundCache).forEach((sound) => {
    sound.unloadAsync();
  });
}
