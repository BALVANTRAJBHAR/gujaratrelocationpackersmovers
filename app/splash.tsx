import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, View } from 'react-native';
import { Text, YStack } from 'tamagui';

const BG_TOP = '#0A1F44';
const BG_BOTTOM = '#050B18';
const ORANGE = '#F97316';

export default function SplashScreen() {
  const router = useRouter();
  const { width } = Dimensions.get('window');

  const [phase, setPhase] = useState<'booking' | 'delivered'>('booking');

  const fadeAll = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const vanX = useRef(new Animated.Value(-Math.max(220, width * 0.65))).current;
  const wheel = useRef(new Animated.Value(0)).current;
  const road = useRef(new Animated.Value(0)).current;
  const deliveredY = useRef(new Animated.Value(14)).current;
  const deliveredOpacity = useRef(new Animated.Value(0)).current;

  const useNativeDriver = Platform.OS !== 'web';

  const loopDuration = 2600;

  const start = useMemo(
    () => () => {
      fadeAll.setValue(0);
      glow.setValue(0);
      vanX.setValue(-Math.max(220, width * 0.65));
      wheel.setValue(0);
      road.setValue(0);
      deliveredY.setValue(14);
      deliveredOpacity.setValue(0);
      setPhase('booking');

      Animated.timing(fadeAll, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver }),
          Animated.timing(glow, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver }),
        ])
      ).start();

      Animated.loop(
        Animated.timing(road, { toValue: 1, duration: 560, easing: Easing.linear, useNativeDriver })
      ).start();

      Animated.loop(
        Animated.timing(wheel, { toValue: 1, duration: 380, easing: Easing.linear, useNativeDriver })
      ).start();

      Animated.timing(vanX, {
        toValue: width * 0.38,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start(() => {
        setPhase('delivered');
        Animated.parallel([
          Animated.timing(deliveredOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver,
          }),
          Animated.timing(deliveredY, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver,
          }),
        ]).start();
      });

      const navTimer = setTimeout(() => {
        router.replace('/home' as any);
      }, loopDuration);

      return () => clearTimeout(navTimer);
    },
    [deliveredOpacity, deliveredY, fadeAll, glow, road, router, useNativeDriver, vanX, wheel, width]
  );

  useEffect(() => {
    const stop = start();
    return () => {
      if (typeof stop === 'function') stop();
    };
  }, [start]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] });
  const blurOpacity = wheel.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const wheelRotate = wheel.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const roadShift = road.interpolate({ inputRange: [0, 1], outputRange: [0, -34] });

  return (
    <YStack flex={1} backgroundColor={BG_BOTTOM}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '70%',
            backgroundColor: BG_TOP,
            opacity: 0.9,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '70%',
            backgroundColor: BG_BOTTOM,
            opacity: 1,
          }}
        />

        <View style={{ position: 'absolute', left: -60, top: 120, width: 320, height: 220, borderRadius: 200, backgroundColor: '#163A7A', opacity: 0.35 }} />
        <View style={{ position: 'absolute', right: -90, top: 180, width: 360, height: 260, borderRadius: 240, backgroundColor: '#0E2A5A', opacity: 0.35 }} />

        <View style={{ position: 'absolute', left: 22, right: 22, top: 90, height: 220, opacity: 0.18 }}>
          {Array.from({ length: 18 }).map((_, i) => (
            <View
              key={String(i)}
              style={{
                position: 'absolute',
                left: (i % 6) * 56,
                top: Math.floor(i / 6) * 68,
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: '#CFE3F4',
              }}
            />
          ))}
        </View>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAll, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <YStack alignItems="center" gap="$1.5">
          <Text fontSize={24} fontWeight="900" color="#FFFFFF" letterSpacing={0.4}>
            GR Packers & Movers
          </Text>
          <Text fontSize={12} fontWeight="700" color="#CFE3F4">
            Fast. Safe. Reliable.
          </Text>
        </YStack>

        <YStack marginTop={38} width="100%" maxWidth={560} borderRadius={20} padding={18} backgroundColor="#07152E" borderWidth={1} borderColor="#173A74" overflow="hidden" gap="$3">
          <Animated.View
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              top: 18,
              height: 44,
              borderRadius: 14,
              backgroundColor: ORANGE,
              opacity: glowOpacity,
            }}
          />

          <YStack alignItems="center" gap="$1">
            <Text color="#FFFFFF" fontWeight="900" fontSize={14}>
              Booking Confirmed ✅
            </Text>
            <Text color="#A7C7FF" fontWeight="700" fontSize={11}>
              Secure & fast dispatch
            </Text>
          </YStack>

          <View style={{ height: 92, width: '100%', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 8,
                height: 10,
                overflow: 'hidden',
                opacity: 0.6,
              }}>
              <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: roadShift }] }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <View
                    key={String(i)}
                    style={{
                      width: 18,
                      height: 2,
                      marginRight: 16,
                      backgroundColor: '#CFE3F4',
                      opacity: i % 3 === 0 ? 0.9 : 0.35,
                      borderRadius: 2,
                    }}
                  />
                ))}
              </Animated.View>
            </Animated.View>

            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                transform: [{ translateX: vanX }],
                width: 220,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#10366F',
                borderWidth: 1,
                borderColor: '#2B6CA3',
                justifyContent: 'center',
              }}>
              <Animated.View
                style={{
                  position: 'absolute',
                  left: -16,
                  top: 16,
                  width: 22,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#CFE3F4',
                  opacity: blurOpacity,
                }}
              />

              <View style={{ position: 'absolute', left: 14, top: 14, width: 56, height: 22, borderRadius: 10, backgroundColor: '#0A1F44', opacity: 0.8 }} />
              <View style={{ position: 'absolute', right: 14, top: 18, width: 44, height: 18, borderRadius: 10, backgroundColor: '#0A1F44', opacity: 0.6 }} />

              <View style={{ position: 'absolute', left: 18, bottom: 10, flexDirection: 'row', gap: 10 }}>
                <Animated.View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#EAF2FF', transform: [{ rotate: wheelRotate }] }} />
                <Animated.View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#EAF2FF', transform: [{ rotate: wheelRotate }] }} />
              </View>

              <View style={{ position: 'absolute', right: 14, bottom: 12, width: 64, height: 6, borderRadius: 6, backgroundColor: ORANGE, opacity: 0.9 }} />
            </Animated.View>
          </View>

          {phase === 'delivered' ? (
            <Animated.View style={{ alignItems: 'center', opacity: deliveredOpacity, transform: [{ translateY: deliveredY }] }}>
              <Text color="#FFFFFF" fontWeight="900" fontSize={14}>
                Delivered Successfully 📦
              </Text>
              <Text color="#CFE3F4" fontWeight="700" fontSize={11}>
                Thank you for choosing us
              </Text>
            </Animated.View>
          ) : (
            <YStack alignItems="center">
              <Text color="#CFE3F4" fontWeight="700" fontSize={11}>
                Tracking your route…
              </Text>
            </YStack>
          )}
        </YStack>

        <YStack marginTop={22} alignItems="center" gap="$0.5">
          <Text color="#94A3B8" fontSize={11} fontWeight="700">
            Developed by BTSoftech
          </Text>
          <Text color="#6B86B6" fontSize={10} fontWeight="700">
            Version 1.0.0
          </Text>
        </YStack>
      </Animated.View>
    </YStack>
  );
}
