import React, { useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';

export type DateTimePickerProps = {
  value: Date;
  mode?: any;
  onChange?: (event: any, date?: Date) => void;
  [key: string]: any;
};

const WebFallback = (props: DateTimePickerProps) => {
  try {
    const mod = require('./AppDateTimePicker.web');
    const Impl = mod?.default ?? mod;
    return Impl ? <Impl {...(props as any)} /> : null;
  } catch {
    return null;
  }
};

let NativePickerImpl: any = null;
if (Platform.OS !== 'web') {
  try {
    const mod = require('@react-native-community/datetimepicker');
    const PickerImpl = mod?.default ?? mod;
    const hasNativeModule =
      !!(NativeModules as any)?.RNDateTimePicker || !!(NativeModules as any)?.DatePickerAndroid;
    NativePickerImpl = hasNativeModule ? PickerImpl : null;
  } catch {
    NativePickerImpl = null;
  }
}

const NativePicker = NativePickerImpl
  ? (props: DateTimePickerProps) => {
      const handledRef = useRef(false);
      const { onChange: originalOnChange, ...rest } = props;

      const handleChange = useCallback((event: any, date?: Date) => {
        if (event?.type === 'dismissed') {
          handledRef.current = false;
          originalOnChange?.(event, date);
          return;
        }
        if (handledRef.current) return;
        handledRef.current = true;
        originalOnChange?.(event, date);
        requestAnimationFrame(() => {
          handledRef.current = false;
        });
      }, [originalOnChange]);

      return <NativePickerImpl {...rest} onChange={handleChange} />;
    }
  : null;

const Picker = Platform.OS === 'web' ? WebFallback : (NativePicker ?? WebFallback);

export default Picker;
