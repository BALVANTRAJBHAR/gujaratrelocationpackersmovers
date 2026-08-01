import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { Button, H2, Input, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { creditWallet } from '@/lib/wallet';
import { useSession } from '@/providers/session-provider';

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

/** Load Razorpay script on web. Same implementation as book/index.tsx. */
async function loadRazorpayScript(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if ((window as any).Razorpay) return true;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });
  return Boolean((window as any).Razorpay);
}

/** Exact same pattern as the working openRazorpayCheckout in book/index.tsx. */
async function openRazorpayCheckout(options: any): Promise<any> {
  if (Platform.OS === 'web') {
    const ok = await loadRazorpayScript();
    if (!ok) throw new Error('Razorpay unavailable on web');
    return await new Promise((resolve, reject) => {
      const Razorpay = (window as any).Razorpay;
      const rz = new Razorpay({
        ...options,
        handler: (response: any) => resolve(response),
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      });
      rz.open();
    });
  }
  // Native: direct top-level import — same as book/index.tsx (RazorpayCheckout.open)
  return await RazorpayCheckout.open(options);
}

export default function AddMoneyScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [processing, setProcessing] = useState(false);

  const effectiveAmount = custom ? parseInt(custom, 10) : amount;

  /** Extract a human-readable string from any error shape (handles nested Razorpay objects). */
  const extractErrorMessage = (err: unknown): string => {
    if (!err) return '';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
      const v = err as Record<string, unknown>;
      const desc = v.description;
      if (desc) {
        if (typeof desc === 'string') return desc;
        if (typeof desc === 'object') {
          const d = desc as Record<string, unknown>;
          return String(d.reason || d.message || d.error || JSON.stringify(desc));
        }
      }
      const direct = v.message || v.error || v.reason || v.detail;
      if (direct) {
        if (typeof direct === 'string') return direct;
        if (typeof direct === 'object') return JSON.stringify(direct);
        return String(direct);
      }
      return JSON.stringify(err);
    }
    return String(err);
  };

  const handleAddMoney = async () => {
    if (!session?.user?.id || !effectiveAmount || effectiveAmount < 1) return;
    setProcessing(true);
    try {
      const razorpayKeyId = await getRazorpayKeyId();
      if (!razorpayKeyId) throw new Error('Missing Razorpay public key. Please try again later.');

      // Razorpay receipt max = 40 chars. Use last 8 chars of userId + timestamp last 8 digits.
      const receiptSuffix = session.user.id.replace(/-/g, '').slice(-8);
      const tsSuffix = String(Date.now()).slice(-8);
      const order = await createRazorpayOrder({
        amount: effectiveAmount * 100,
        currency: 'INR',
        receipt: `wlt_${receiptSuffix}_${tsSuffix}`, // max 25 chars, well within 40
        notes: { user_id: session.user.id },
      });

      const options = {
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Gujarat Relocation PackersMovers',
        description: `Add ₹${effectiveAmount} to Wallet`,
        order_id: order.id,
        prefill: {
          name: profile?.name || '',
          email: session.user.email || '',
          contact: profile?.phone || '',
        },
        theme: { color: '#1F4E79' },
      };

      const paymentData: any = await openRazorpayCheckout(options);

      const valid = await verifyRazorpaySignature({
        order_id: order.id,
        payment_id: paymentData.razorpay_payment_id,
        signature: paymentData.razorpay_signature,
      });

      if (!valid) throw new Error('Payment verification failed');

      await creditWallet({
        userId: session.user.id,
        amount: effectiveAmount,
        referenceType: 'add_money',
        referenceId: paymentData.razorpay_payment_id,
        description: `Added ₹${effectiveAmount} to wallet`,
      });

      await refreshProfile();
      Alert.alert(
        'Payment Successful',
        `₹${effectiveAmount.toLocaleString('en-IN')} has been added to your wallet.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      // Log raw error so we can inspect exact Razorpay / Edge Function error shape in dev tools
      console.error('[Wallet AddMoney] raw error:', JSON.stringify(e, null, 2), e);
      const msg = extractErrorMessage(e);
      if (/cancel/i.test(msg)) return;
      const cleaned = msg.replace(/^\(\d+\)\s*/, '').trim();
      Alert.alert('Payment Failed', cleaned || 'Payment failed. Please try again.');
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
                <Text fontWeight="800" fontSize={t(15)} color={!custom && amount === a ? '#FFFFFF' : theme.text}>
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
