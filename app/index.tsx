import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { t } from '@/constants/typography';

const APP_FONT = Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman';

export default function SplashScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    const timer = setTimeout(() => {
      router.replace('/home' as any);
    }, 2300);

    return () => clearTimeout(timer);
  }, [fade, progress, rise, router]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['18%', '100%'],
  });

  return (
    <YStack flex={1} backgroundColor="#F8FAFC" alignItems="center" justifyContent="center" padding={28}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '36%',
          backgroundColor: '#0B1F3A',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '36%',
          height: 1,
          backgroundColor: '#D7B56D',
          opacity: 0.7,
        }}
      />

      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: rise }],
          width: '100%',
          maxWidth: 360,
          alignItems: 'center',
        }}>
        <YStack
          width="100%"
          alignItems="center"
          backgroundColor="#FFFFFF"
          borderRadius={22}
          paddingHorizontal={24}
          paddingVertical={30}
          borderWidth={1}
          borderColor="#E2E8F0"
          shadowColor="#0B1F3A"
          shadowOffset={{ width: 0, height: 16 }}
          shadowOpacity={0.16}
          shadowRadius={28}
          elevation={10}
          gap="$3">
          <View
            style={{
              width: 160,
              height: 160,
              borderRadius: 32,
              backgroundColor: '#F8FAFC',
              borderWidth: 1,
              borderColor: '#E2E8F0',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Image
              source={
                Platform.OS === 'web'
                  ? require('../assets/images/PackersMoversLogo.png')
                  : require('../assets/images/GR-New-Icon.png')
              }
              resizeMode="contain"
              style={{ width: Platform.OS === 'web' ? 100 : 130, height: Platform.OS === 'web' ? 100 : 130 }}
            />
          </View>

          <YStack alignItems="center" gap="$1">
            <Text
              color="#0B1F3A"
              fontSize={t(23)}
              lineHeight={28}
              fontWeight="900"
              textAlign="center"
              style={{ fontFamily: APP_FONT }}>
              Gujarat Relocation
            </Text>
            <Text
              color="#334155"
              fontSize={t(15)}
              lineHeight={20}
              fontWeight="800"
              textAlign="center"
              style={{ fontFamily: APP_FONT }}>
              Packers & Movers
            </Text>
          </YStack>

          <XStack
            alignItems="center"
            justifyContent="center"
            gap="$2"
            backgroundColor="#EEF6FF"
            borderRadius={999}
            paddingHorizontal={14}
            paddingVertical={8}>
            <FontAwesome5 name="shield-alt" size={13} color="#0B6B8F" />
            <Text color="#0B6B8F" fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_FONT }}>
              Safe relocation since 2006
            </Text>
          </XStack>

          <YStack width="100%" gap="$2" marginTop={6}>
            <View
              style={{
                height: 5,
                width: '100%',
                borderRadius: 999,
                overflow: 'hidden',
                backgroundColor: '#E2E8F0',
              }}>
              <Animated.View
                style={{
                  height: '100%',
                  width: progressWidth,
                  borderRadius: 999,
                  backgroundColor: '#D7B56D',
                }}
              />
            </View>
            <Text color="#64748B" fontSize={t(11)} fontWeight="700" textAlign="center" style={{ fontFamily: APP_FONT }}>
              Preparing your moving experience
            </Text>
          </YStack>
        </YStack>

        <Text color="#64748B" fontSize={t(11)} fontWeight="700" marginTop={18} style={{ fontFamily: APP_FONT }}>
          Trusted moving, home service and property support
        </Text>
      </Animated.View>
    </YStack>
  );
}
