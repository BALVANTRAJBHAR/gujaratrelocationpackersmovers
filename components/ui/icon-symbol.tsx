// Fallback for using MaterialIcons on Android and web.

import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import React from 'react';
import { OpaqueColorValue, Platform, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], string>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'clock.fill': 'schedule',
  'location.fill': 'location-on',
  'steeringwheel': 'local-shipping',
  'gearshape.fill': 'settings',
  'bell.fill': 'notifications',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const MaterialIcons = React.useMemo(() => {
    if (Platform.OS === 'web') return null;
    try {
      return require('@expo/vector-icons/MaterialIcons').default as any;
    } catch {
      return null;
    }
  }, []);

  if (!MaterialIcons) return null;
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
