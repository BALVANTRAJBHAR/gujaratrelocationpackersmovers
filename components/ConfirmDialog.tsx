import { Modal, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { t } from '@/constants/typography';
import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  busy,
  onConfirm,
  onClose,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <YStack
          backgroundColor={theme.bgCard}
          borderRadius={18}
          padding={20}
          maxWidth={400}
          width="100%"
          gap="$3"
          borderWidth={1}
          borderColor={theme.border}>
          <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
            {title ?? 'Confirm'}
          </Text>
          <Text fontSize={t(14)} color={theme.textMuted}>
            {message}
          </Text>
          <XStack gap="$3" justifyContent="flex-end" marginTop={10}>
            <Button
              size="$3"
              backgroundColor={theme.bgCardSecondary}
              color={theme.text}
              disabled={busy}
              onPress={onClose}>
              {cancelLabel}
            </Button>
            <Button
              size="$3"
              backgroundColor={theme.danger}
              color="#FFFFFF"
              disabled={busy}
              onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
