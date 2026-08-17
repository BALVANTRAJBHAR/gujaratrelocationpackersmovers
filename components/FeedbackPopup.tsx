import { Alert, Modal, Pressable } from 'react-native';
import { useMemo, useState } from 'react';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { FontAwesome5 } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type Props = {
  open: boolean;
  title: string;
  subtitle: string;
  toUserId: string | null;
  bookingId?: string | null;
  homeServiceRequestId?: string | null;
  tags: string[];
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function FeedbackPopup({
  open,
  title,
  subtitle,
  toUserId,
  bookingId,
  homeServiceRequestId,
  tags,
  onClose,
  onSubmitted,
}: Props) {
  const { session } = useSession();
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = rating > 0;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const reset = () => {
    setRating(0);
    setSelectedTags([]);
    setComment('');
  };

  const persist = async (skipped: boolean) => {
    if (!session?.user?.id || !toUserId || saving) return;
    setSaving(true);
    try {
      const row = {
        from_user_id: session.user.id,
        to_user_id: toUserId,
        booking_id: bookingId ?? null,
        home_service_request_id: homeServiceRequestId ?? null,
        rating: skipped ? null : rating,
        tags: skipped ? [] : selectedTags,
        comment: skipped ? null : comment.trim() || null,
        skipped,
      };
      const { error } = await supabase.from('feedback').insert(row);
      if (error) {
        Alert.alert('Error', 'Could not save feedback. Please try again.');
        return;
      }
      reset();
      onClose();
      onSubmitted?.();
    } finally {
      setSaving(false);
    }
  };

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => persist(true)}>
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)" padding={16}>
        <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={20} width="100%" maxWidth={420} gap={4}>
          <Text fontWeight="900" fontSize={17} color="#111827" textAlign="center">
            {title}
          </Text>
          <Text fontSize={12.5} color="#374151" textAlign="center">
            {subtitle}
          </Text>

          <XStack justifyContent="center" gap={10} marginTop={14}>
            {stars.map((s) => (
              <Pressable key={s} onPress={() => setRating(s)} hitSlop={6}>
                <FontAwesome5 name="star" size={30} color={rating >= s ? '#F59E0B' : '#D1D5DB'} solid />
              </Pressable>
            ))}
          </XStack>
          {rating > 0 ? (
            <Text fontSize={12} color="#F59E0B" fontWeight="700" textAlign="center" marginTop={4}>
              {rating === 1 ? 'Very bad' : rating === 2 ? 'Bad' : rating === 3 ? 'Average' : rating === 4 ? 'Good' : 'Excellent'}
            </Text>
          ) : (
            <Text fontSize={11.5} color="#6B7280" textAlign="center" marginTop={4}>
              Tap a star to rate
            </Text>
          )}

          {tags.length ? (
            <XStack flexWrap="wrap" gap={8} marginTop={14} justifyContent="center">
              {tags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <Pressable key={tag} onPress={() => toggleTag(tag)}>
                    <YStack
                      backgroundColor={active ? '#1F4E79' : '#F3F4F6'}
                      borderRadius={999}
                      paddingHorizontal={12}
                      paddingVertical={6}
                      borderWidth={1}
                      borderColor={active ? '#1F4E79' : '#E5E7EB'}>
                      <Text fontSize={12} fontWeight="700" color={active ? '#FFFFFF' : '#374151'}>
                        {tag}
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
          ) : null}

          <Input
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment (optional)"
            placeholderTextColor="#6B7280"
            backgroundColor="#F9FAFB"
            borderColor="#E5E7EB"
            color="#111827"
            borderRadius={10}
            marginTop={14}
            paddingVertical={10}
          />

          <YStack gap={8} marginTop={16}>
            <Button
              backgroundColor="#1F4E79"
              color="#FFFFFF"
              disabled={!canSubmit || saving}
              opacity={canSubmit && !saving ? 1 : 0.5}
              onPress={() => void persist(false)}>
              <Text color="#FFFFFF" fontWeight="800">{saving ? 'Submitting...' : 'Submit Feedback'}</Text>
            </Button>
            <Button
              backgroundColor="#F3F4F6"
              color="#374151"
              disabled={saving}
              onPress={() => void persist(true)}>
              <Text color="#374151" fontWeight="700">Skip</Text>
            </Button>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}
