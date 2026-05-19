import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

export type PropertyMediaItem = {
  id: string;
  uri: string;
  kind: 'photo' | 'video';
};

type PropertyMediaGridProps = {
  items: PropertyMediaItem[];
  size?: number;
  emptyText?: string;
};

export function PropertyMediaGrid({ items, size = 108, emptyText = 'No media.' }: PropertyMediaGridProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [previewKind, setPreviewKind] = useState<'photo' | 'video'>('photo');

  const openPreview = (kind: 'photo' | 'video', uri: string) => {
    setPreviewKind(kind);
    setPreviewUri(uri);
    setPreviewOpen(true);
  };

  if (!items.length) {
    return (
      <Text color="#64748B" fontSize={12}>
        {emptyText}
      </Text>
    );
  }

  return (
    <>
      <XStack gap="$2" flexWrap="wrap">
        {items.map((item) => {
          const isVideo = item.kind === 'video';
          return (
            <Pressable
              key={item.id}
              onPress={() => openPreview(item.kind, item.uri)}
              style={{
                width: size,
                height: size,
                borderRadius: 12,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#F3F4F6',
              }}>
              {isVideo ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Video
                    source={{ uri: item.uri }}
                    style={{ position: 'absolute', width: size, height: size }}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted
                  />
                  <MaterialCommunityIcons name="play-circle" size={40} color="#1F4E79" />
                </View>
              ) : (
                <Image source={{ uri: item.uri }} style={{ width: size, height: size }} contentFit="cover" />
              )}
            </Pressable>
          );
        })}
      </XStack>

      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16, justifyContent: 'center' }}
          onPress={() => setPreviewOpen(false)}>
          <Pressable onPress={() => {}} style={{ alignItems: 'center' }}>
            <YStack gap="$2" width="100%">
              {previewKind === 'photo' ? (
                <Image source={{ uri: previewUri }} style={{ width: '100%', height: 360 }} contentFit="contain" />
              ) : (
                <Video
                  source={{ uri: previewUri }}
                  style={{ width: '100%', height: 360 }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                />
              )}
              <Text color="#FFFFFF" textAlign="center" fontWeight="700">
                Tap outside to close
              </Text>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function uploadsToMediaItems(
  uploads: Array<{ id: string; file_url: string; file_type?: string | null }>
): PropertyMediaItem[] {
  return uploads.map((u) => {
    const type = String(u.file_type ?? '').toLowerCase();
    const kind: 'photo' | 'video' = type.includes('video') || type.includes('mp4') ? 'video' : 'photo';
    return { id: u.id, uri: String(u.file_url ?? '').trim(), kind };
  });
}
