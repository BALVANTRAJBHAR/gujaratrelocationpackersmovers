import { ActivityIndicator, Modal, Platform, Pressable } from 'react-native';
import { useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

import MobileDatePicker from '@/components/MobileDatePicker';
import { formatDateDDMMYYYY } from '@/lib/date-format';
import { RESCHEDULE_TIME_OPTIONS, todayIso } from '@/lib/reschedule-options';

type Props = {
  open: boolean;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (dateIso: string, timeLabel: string) => void;
  busy?: boolean;
};

export default function RescheduleDialog({ open, title, confirmLabel, onClose, onConfirm, busy }: Props) {
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(RESCHEDULE_TIME_OPTIONS[1] ?? RESCHEDULE_TIME_OPTIONS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
        <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)" padding={16}>
          <YStack backgroundColor="#FFF" borderRadius={16} padding={20} width="100%" maxWidth={400}>
            <Text fontWeight="800" fontSize={17} color="#111827">
              {title ?? 'Reschedule'}
            </Text>
            <Text fontSize={12} color="#374151" marginTop={4}>
              Select the new date and time slot for this {confirmLabel?.toLowerCase() === 'reschedule service' ? 'service' : 'booking'}.
            </Text>

            <Text fontSize={13} fontWeight="700" color="#374151" marginTop={16} marginBottom={6}>
              Date
            </Text>
            {Platform.OS === 'web' ? (
              <YStack
                backgroundColor="#F9FAFB"
                borderColor="#E5E7EB"
                borderWidth={1}
                borderRadius={10}
                paddingHorizontal={12}
                paddingVertical={10}>
                <input
                  type="date"
                  value={date}
                  min={todayIso()}
                  onChange={(e) => setDate((e.target as any).value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#111827',
                    outline: 'none',
                    fontSize: 15,
                  }}
                />
              </YStack>
            ) : (
              <Pressable onPress={() => { setPickerValue(date ? new Date(`${date}T12:00:00.000Z`) : new Date()); setPickerOpen(true); }}>
                <YStack
                  backgroundColor="#F9FAFB"
                  borderColor="#E5E7EB"
                  borderWidth={1}
                  borderRadius={10}
                  paddingHorizontal={12}
                  paddingVertical={12}>
                  <Text color="#111827" fontSize={15}>
                    {date ? formatDateDDMMYYYY(date) : 'Select date'}
                  </Text>
                </YStack>
              </Pressable>
            )}

            <Text fontSize={13} fontWeight="700" color="#374151" marginTop={16} marginBottom={6}>
              Time
            </Text>
            <XStack flexWrap="wrap" gap={8}>
              {RESCHEDULE_TIME_OPTIONS.map((opt) => (
                <Pressable key={opt} onPress={() => setTime(opt)}>
                  <YStack
                    backgroundColor={time === opt ? '#1F4E79' : '#F0F4F8'}
                    borderRadius={999}
                    paddingHorizontal={14}
                    paddingVertical={8}>
                    <Text fontSize={13} fontWeight="700" color={time === opt ? '#FFFFFF' : '#374151'}>
                      {opt}
                    </Text>
                  </YStack>
                </Pressable>
              ))}
            </XStack>

            <XStack gap={10} marginTop={22} justifyContent="flex-end">
              <Button
                size="$3"
                backgroundColor="#E5E7EB"
                color="#374151"
                borderRadius={10}
                disabled={busy}
                onPress={onClose}>
                Cancel
              </Button>
              <Button
                size="$3"
                backgroundColor="#1F4E79"
                color="#FFFFFF"
                borderRadius={10}
                disabled={busy || !date}
                onPress={() => { if (date) onConfirm(date, time); }}>
                {busy ? (
                  <XStack gap={6} alignItems="center">
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text color="#FFFFFF" fontWeight="700">Processing...</Text>
                  </XStack>
                ) : (
                  confirmLabel ?? 'Confirm'
                )}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>
      <MobileDatePicker
        value={pickerValue}
        open={pickerOpen}
        minDate={new Date()}
        onClose={() => setPickerOpen(false)}
        onChange={(d) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          setDate(`${yyyy}-${mm}-${dd}`);
        }}
      />
    </>
  );
}
