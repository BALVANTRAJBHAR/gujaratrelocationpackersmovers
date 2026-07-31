import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable } from 'react-native';
import { Button, H2, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/constants/typography';
import { getWalletBalance, getWalletTransactions, type WalletTransaction } from '@/lib/wallet';
import { formatDateTimeDDMMYYYY } from '@/lib/date-format';
import { useSession } from '@/providers/session-provider';

export default function WalletScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [txns, setTxns] = useState<WalletTransaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!session?.user?.id) return;
    try {
      const [b, t] = await Promise.all([
        getWalletBalance(session.user.id),
        getWalletTransactions(session.user.id),
      ]);
      setBalance(b);
      setTxns(t);
    } catch (e) {
      console.warn('Wallet load error', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
  }, [session?.user?.id]));

  const typeLabel = (ref: string) => {
    const labels: Record<string, string> = {
      add_money: 'Wallet Top-up',
      booking_refund: 'Booking Refund',
      booking_payment: 'Shifting Payment',
      home_service_payment: 'Home Service Payment',
      referral_credit: 'Referral Reward',
      referral_signup_bonus: 'Signup Bonus',
    };
    return labels[ref] || ref;
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg} padding={24} minHeight="100%" gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 color={theme.text}>Wallet</H2>
        <Pressable onPress={() => router.back()}>
          <Text color={theme.info} fontWeight="700">Back</Text>
        </Pressable>
      </XStack>

      <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$3" alignItems="center">
        <Text color={theme.textMuted} fontSize={t(13)}>Available Balance</Text>
        <Text fontSize={t(36)} fontWeight="900" color={theme.text}>₹{balance.toLocaleString('en-IN')}</Text>
        <Button
          backgroundColor="#F97316"
          color="#0B1220"
          borderRadius={12}
          fontWeight="800"
          paddingHorizontal={24}
          onPress={() => router.push('/wallet/add')}>
          Add Money
        </Button>
      </YStack>

      <Text fontSize={t(16)} fontWeight="800" color={theme.text}>Transactions</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : txns.length === 0 ? (
        <Text color={theme.textMuted} fontSize={t(14)}>No transactions yet</Text>
      ) : (
        <YStack gap="$2">
          {txns.map((tx) => (
            <YStack key={tx.id} backgroundColor={theme.bgCard} borderRadius={14} padding={14} borderWidth={1} borderColor={theme.border}>
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1} gap={2}>
                  <Text color={theme.text} fontWeight="800" fontSize={t(14)}>
                    {typeLabel(tx.reference_type)}
                  </Text>
                  {tx.description ? (
                    <Text color={theme.textMuted} fontSize={t(12)} numberOfLines={1}>
                      {tx.description}
                    </Text>
                  ) : null}
                </YStack>
                <Text
                  fontSize={t(16)}
                  fontWeight="900"
                  color={tx.type === 'credit' ? '#16A34A' : '#DC2626'}>
                  {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                </Text>
              </XStack>
              <Text color={theme.textMuted} fontSize={t(11)}>
                {formatDateTimeDDMMYYYY(tx.created_at)}
              </Text>
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
