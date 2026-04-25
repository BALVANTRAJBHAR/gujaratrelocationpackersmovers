import React from 'react';
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

let NativePicker: any = null;
if (Platform.OS !== 'web') {
  try {
    const mod = require('@react-native-community/datetimepicker');
    const PickerImpl = mod?.default ?? mod;
    const hasNativeModule =
      !!(NativeModules as any)?.RNDateTimePicker || !!(NativeModules as any)?.DatePickerAndroid;
    NativePicker = hasNativeModule ? PickerImpl : null;
  } catch {
    NativePicker = null;
  }
}

const Picker = Platform.OS === 'web' ? WebFallback : (NativePicker ?? WebFallback);

export default Picker;
