import RazorpayCheckout from 'react-native-razorpay';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable } from 'react-native';
import { Button, H2, Input, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
import { t } from '@/constants/typography';
import { creditWallet } from '@/lib/wallet';
import { useSession } from '@/providers/session-provider';

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

async function openRazorpay(options: any): Promise<any> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Not in browser');
    if (!(window as any).Razorpay) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Razorpay'));
        document.body.appendChild(s);
      });
    }
    return await new Promise((resolve, reject) => {
      const rz = new (window as any).Razorpay({
        ...options,
        handler: (r: any) => resolve(r),
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      });
      rz.open();
    });
  }
  return await RazorpayCheckout.open(options);
}

export default function AddMoneyScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [processing, setProcessing] = useState(false);

  const effectiveAmount = custom ? parseInt(custom, 10) : amount;

  const handleAddMoney = async () => {
    if (!session?.user?.id || !effectiveAmount || effectiveAmount < 1) return;
    setProcessing(true);
    try {
      const order = await createRazorpayOrder({
        amount: effectiveAmount * 100,
        currency: 'INR',
        receipt: `wallet_${session.user.id}_${Date.now()}`,
        notes: { user_id: session.user.id, purpose: 'wallet_topup' },
      });

      const keyId = await getRazorpayKeyId();
      const response = await openRazorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'GR Packers & Movers',
        description: `Add ₹${effectiveAmount} to Wallet`,
        order_id: order.id,
        theme: { color: '#1F4E79' },
      });

      const razorpayOrderId = response.razorpay_order_id || response.razorpay_order_id;
      const razorpayPaymentId = response.razorpay_payment_id || response.razorpay_payment_id;
      const razorpaySignature = response.razorpay_signature || response.razorpay_signature;

      const valid = await verifyRazorpaySignature({
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        signature: razorpaySignature,
        user_id: session.user.id,
        amount: effectiveAmount,
        purpose: 'wallet_topup',
      });

      if (!valid) throw new Error('Payment verification failed');

      await creditWallet({
        userId: session.user.id,
        amount: effectiveAmount,
        referenceType: 'add_money',
        referenceId: razorpayPaymentId,
        description: `Added ₹${effectiveAmount} to wallet`,
      });

      await refreshProfile();
      router.back();
    } catch (e: any) {
      if (e?.message !== 'Payment cancelled') {
        alert(e?.message || 'Payment failed');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg} padding={24} minHeight="100%" gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 color={theme.text}>Add Money</H2>
        <Pressable onPress={() => router.back()}>
          <Text color={theme.info} fontWeight="700">Back</Text>
        </Pressable>
      </XStack>

      <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$4">
        <Text color={theme.textMuted} fontSize={t(13)}>Select Amount</Text>
        <XStack flexWrap="wrap" gap="$2">
          {QUICK_AMOUNTS.map((a) => (
            <Pressable key={a} onPress={() => { setAmount(a); setCustom(''); }}>
              <YStack
                paddingHorizontal={16}
                paddingVertical={10}
                borderRadius={10}
                backgroundColor={!custom && amount === a ? '#1F4E79' : theme.bgSecondary}
                borderWidth={1}
                borderColor={!custom && amount === a ? '#1F4E79' : theme.border}>
                <Text
                  fontWeight="800"
                  fontSize={t(15)}
                  color={!custom && amount === a ? '#FFFFFF' : theme.text}>
                  ₹{a}
                </Text>
              </YStack>
            </Pressable>
          ))}
        </XStack>

        <Input
          placeholder="Custom amount"
          value={custom}
          onChangeText={(v) => { setCustom(v); setAmount(0); }}
          keyboardType="number-pad"
          backgroundColor={theme.inputBg}
          borderColor={theme.inputBorder}
          color={theme.inputText}
          placeholderTextColor={theme.textMuted}
        />

        <Button
          backgroundColor="#F97316"
          color="#0B1220"
          borderRadius={12}
          fontWeight="800"
          paddingVertical={16}
          minHeight={52}
          disabled={processing || !effectiveAmount || effectiveAmount < 1}
          opacity={processing || !effectiveAmount || effectiveAmount < 1 ? 0.6 : 1}
          onPress={handleAddMoney}>
          {processing ? (
            <ActivityIndicator size="small" color="#0B1220" />
          ) : (
            `Add ₹${effectiveAmount?.toLocaleString('en-IN') || '0'}`
          )}
        </Button>
      </YStack>
    </YStack>
  );
}
